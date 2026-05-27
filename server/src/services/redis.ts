import Redis from 'ioredis';
import { config } from '../config';
import {
  ServerStatus,
  OnlinePlayer,
  AreaPopulation,
  ChatMessage,
  ActivityEvent,
} from '../types';

let client: Redis | null = null;

function createRedisClient(label: string): Redis {
  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    lazyConnect: true,
    retryStrategy(times) {
      return Math.min(times * 1000, 30000);
    },
  });

  redis.on('error', (err) => {
    console.error(`Redis ${label} error:`, err.message);
  });

  redis.on('connect', () => {
    console.log(`Redis ${label} connected`);
  });

  redis.connect().catch(() => {
    // Handled by error event + retry strategy
  });

  return redis;
}

/** Shared client for non-blocking reads (REST endpoints). */
export function getRedisClient(): Redis {
  if (!client) {
    client = createRedisClient('main');
  }
  return client;
}

/**
 * Create a dedicated client for blocking reads (SSE streams).
 * Each SSE connection gets its own client because XREAD BLOCK
 * monopolizes the connection until it returns.
 */
export function createBlockingClient(): Redis {
  return createRedisClient('stream');
}

export function isRedisConnected(): boolean {
  return client?.status === 'ready' || client?.status === 'connect';
}

// ─── Server Status ──────────────────────────────────────────

export async function getServerStatus(): Promise<ServerStatus> {
  const redis = getRedisClient();
  const data = await redis.hgetall('tdn:server_status');
  return {
    playerCount: parseInt(data.player_count || '0', 10),
    lastHeartbeat: parseInt(data.last_heartbeat || '0', 10),
  };
}

// ─── Online Players ─────────────────────────────────────────

export async function getOnlinePlayers(): Promise<OnlinePlayer[]> {
  const redis = getRedisClient();
  const data = await redis.hgetall('tdn:online');

  return Object.entries(data).map(([uuid, json]) => {
    const info = JSON.parse(json);
    return {
      uuid,
      name: info.name || '',
      player: info.player || '',
      area: info.area || '',
      areaTag: info.areaTag || '',
      hp: info.hp || '0/0',
      level: info.level || 0,
      loginTime: info.loginTime || 0,
    };
  });
}

// ─── Area Populations ───────────────────────────────────────

export async function getAreaPopulations(): Promise<AreaPopulation[]> {
  const redis = getRedisClient();
  const popData = await redis.hgetall('tdn:area_pop');

  // Build an areaTag→areaName lookup from online player data
  const onlineData = await redis.hgetall('tdn:online');
  const areaNames: Record<string, string> = {};
  for (const json of Object.values(onlineData)) {
    try {
      const info = JSON.parse(json);
      if (info.areaTag && info.area) {
        areaNames[info.areaTag] = info.area;
      }
    } catch {}
  }

  const areas: AreaPopulation[] = [];

  for (const [areaTag, countStr] of Object.entries(popData)) {
    const count = parseInt(countStr, 10);
    if (count <= 0) continue;

    const playersData = await redis.hgetall(`tdn:area_players:${areaTag}`);
    const players = Object.entries(playersData).map(([uuid, name]) => ({ uuid, name }));

    areas.push({
      areaTag,
      areaName: areaNames[areaTag] || areaTag,
      playerCount: count,
      players,
    });
  }

  // Sort by player count descending
  areas.sort((a, b) => b.playerCount - a.playerCount);
  return areas;
}

export async function getAreaPlayers(areaTag: string): Promise<{ uuid: string; name: string }[]> {
  const redis = getRedisClient();
  const data = await redis.hgetall(`tdn:area_players:${areaTag}`);
  return Object.entries(data).map(([uuid, name]) => ({ uuid, name }));
}

// ─── Character Info ─────────────────────────────────────────

export async function getCharacterInfo(uuid: string): Promise<Record<string, any> | null> {
  const redis = getRedisClient();
  const data = await redis.hget('tdn:charinfo', uuid);
  if (!data) return null;
  return JSON.parse(data);
}

// ─── Area Analytics ─────────────────────────────────────────

export interface AreaAnalytics {
  areaTag: string;
  areaName: string;
  allTime: number;
  today: number;
  week: number;
  month: number;
}

export async function getAreaAnalytics(): Promise<AreaAnalytics[]> {
  const redis = getRedisClient();

  // Get area names and all-time visits
  const [areaNames, allTimeVisits] = await Promise.all([
    redis.hgetall('tdn:area_names'),
    redis.hgetall('tdn:area_visits'),
  ]);

  // Calculate day indices for today, 7 days ago, 30 days ago
  const nowDayIndex = Math.floor(Date.now() / 1000 / 86400);
  const dayKeys: string[] = [];
  for (let d = 0; d < 30; d++) {
    dayKeys.push(`tdn:area_visits:${nowDayIndex - d}`);
  }

  // Pipeline fetch all daily keys
  const pipeline = redis.pipeline();
  for (const key of dayKeys) {
    pipeline.hgetall(key);
  }
  const dailyResults = await pipeline.exec();

  // Build area data map
  const areaMap: Record<string, AreaAnalytics> = {};

  // Initialize from all-time visits
  for (const [tag, countStr] of Object.entries(allTimeVisits)) {
    areaMap[tag] = {
      areaTag: tag,
      areaName: areaNames[tag] || tag,
      allTime: parseInt(countStr, 10) || 0,
      today: 0,
      week: 0,
      month: 0,
    };
  }

  // Also add any areas that have names but no visits yet
  for (const [tag, name] of Object.entries(areaNames)) {
    if (!areaMap[tag]) {
      areaMap[tag] = { areaTag: tag, areaName: name, allTime: 0, today: 0, week: 0, month: 0 };
    }
  }

  // Accumulate daily visits
  if (dailyResults) {
    for (let d = 0; d < dailyResults.length; d++) {
      const [err, data] = dailyResults[d] as [Error | null, Record<string, string>];
      if (err || !data) continue;

      for (const [tag, countStr] of Object.entries(data)) {
        if (!areaMap[tag]) {
          areaMap[tag] = { areaTag: tag, areaName: areaNames[tag] || tag, allTime: 0, today: 0, week: 0, month: 0 };
        }
        const count = parseInt(countStr, 10) || 0;
        if (d === 0) areaMap[tag].today += count;
        if (d < 7) areaMap[tag].week += count;
        areaMap[tag].month += count;
      }
    }
  }

  return Object.values(areaMap);
}

export async function getAreaDailyHistory(days: number = 30): Promise<{ dayIndex: number; date: string; totalVisits: number }[]> {
  const redis = getRedisClient();
  const nowDayIndex = Math.floor(Date.now() / 1000 / 86400);

  const pipeline = redis.pipeline();
  for (let d = days - 1; d >= 0; d--) {
    pipeline.hgetall(`tdn:area_visits:${nowDayIndex - d}`);
  }
  const results = await pipeline.exec();

  const history: { dayIndex: number; date: string; totalVisits: number }[] = [];

  for (let d = days - 1; d >= 0; d--) {
    const idx = days - 1 - d;
    const dayIndex = nowDayIndex - d;
    const dateObj = new Date(dayIndex * 86400 * 1000);
    const date = dateObj.toISOString().split('T')[0];

    let total = 0;
    if (results) {
      const [err, data] = results[idx] as [Error | null, Record<string, string>];
      if (!err && data) {
        for (const countStr of Object.values(data)) {
          total += parseInt(countStr, 10) || 0;
        }
      }
    }

    history.push({ dayIndex, date, totalVisits: total });
  }

  return history;
}

// ─── Chat Stream ────────────────────────────────────────────

function parseStreamEntry(entry: [string, string[]]): ChatMessage {
  const [id, fields] = entry;
  // Fields come as [key, value, key, value, ...]
  const map: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    map[fields[i]] = fields[i + 1];
  }

  const data = map.d ? JSON.parse(map.d) : {};
  return {
    id,
    speaker: data.speaker || '',
    channel: data.channel || '',
    msg: data.msg || '',
    areaTag: data.areaTag || '',
    areaName: data.areaName || '',
    ts: data.ts || 0,
  };
}

/**
 * Read recent chat messages from a stream (non-blocking).
 * Returns messages in chronological order (oldest first).
 */
export async function getChatHistory(areaTag: string, count: number = 50): Promise<ChatMessage[]> {
  const redis = getRedisClient();
  const key = areaTag === '_all' ? 'tdn:chat:_all' : `tdn:chat:${areaTag}`;

  // XREVRANGE gets newest first, then we reverse for chronological order
  const entries = await redis.xrevrange(key, '+', '-', 'COUNT', count);
  return entries.map((e) => parseStreamEntry(e as [string, string[]])).reverse();
}

/**
 * Read older messages before a given stream ID.
 * Returns messages in chronological order (oldest first).
 */
export async function getChatHistoryBefore(areaTag: string, beforeId: string, count: number = 50): Promise<ChatMessage[]> {
  const redis = getRedisClient();
  const key = areaTag === '_all' ? 'tdn:chat:_all' : `tdn:chat:${areaTag}`;

  // XREVRANGE from just before the given ID to the beginning
  // Decrement the sequence to exclude the beforeId itself
  const parts = beforeId.split('-');
  const ts = parts[0];
  const seq = parseInt(parts[1] || '0', 10);
  const exclusiveEnd = seq > 0 ? `${ts}-${seq - 1}` : `${parseInt(ts, 10) - 1}`;

  const entries = await redis.xrevrange(key, exclusiveEnd, '-', 'COUNT', count);
  return entries.map((e) => parseStreamEntry(e as [string, string[]])).reverse();
}

/**
 * Blocking read for new chat messages (for SSE).
 * Pass a dedicated blocking client to avoid blocking the shared client.
 */
export async function readChatStream(
  areaTag: string,
  lastId: string,
  blockingClient: Redis,
  blockMs: number = 5000
): Promise<{ messages: ChatMessage[]; lastId: string }> {
  const key = areaTag === '_all' ? 'tdn:chat:_all' : `tdn:chat:${areaTag}`;

  const result = await (blockingClient as any).xread('BLOCK', blockMs, 'COUNT', 50, 'STREAMS', key, lastId) as any[] | null;

  if (!result) {
    return { messages: [], lastId };
  }

  // result is [[key, entries]] where entries is [[id, fields], ...]
  const entries = result[0][1] as [string, string[]][];
  const messages = entries.map(parseStreamEntry);
  const newLastId = messages.length > 0 ? messages[messages.length - 1].id : lastId;

  return { messages, lastId: newLastId };
}

// ─── Activity Feed ──────────────────────────────────────────

function parseActivityEntry(entry: [string, string[]]): ActivityEvent {
  const [id, fields] = entry;
  const map: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    map[fields[i]] = fields[i + 1];
  }

  const data = map.d ? JSON.parse(map.d) : {};
  return {
    id,
    type: data.type || '',
    player: data.player || '',
    detail: data.detail || '',
    area: data.area,
    ts: data.ts || 0,
  };
}

export async function getActivityHistory(count: number = 50): Promise<ActivityEvent[]> {
  const redis = getRedisClient();
  const entries = await redis.xrevrange('tdn:feed', '+', '-', 'COUNT', count);
  return entries.map((e) => parseActivityEntry(e as [string, string[]])).reverse();
}

export async function readActivityFeed(
  lastId: string,
  blockingClient: Redis,
  blockMs: number = 5000
): Promise<{ events: ActivityEvent[]; lastId: string }> {
  const result = await (blockingClient as any).xread('BLOCK', blockMs, 'COUNT', 50, 'STREAMS', 'tdn:feed', lastId) as any[] | null;

  if (!result) {
    return { events: [], lastId };
  }

  const entries = result[0][1] as [string, string[]][];
  const events = entries.map(parseActivityEntry);
  const newLastId = events.length > 0 ? events[events.length - 1].id : lastId;

  return { events, lastId: newLastId };
}
