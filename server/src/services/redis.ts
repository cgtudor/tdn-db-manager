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
  return client?.status === 'ready';
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

  const areas: AreaPopulation[] = [];

  for (const [areaTag, countStr] of Object.entries(popData)) {
    const count = parseInt(countStr, 10);
    if (count <= 0) continue;

    // Fetch the player list for this area
    const playersData = await redis.hgetall(`tdn:area_players:${areaTag}`);
    const players = Object.entries(playersData).map(([uuid, name]) => ({ uuid, name }));

    areas.push({
      areaTag,
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
 * Use lastId = '0-0' to get all messages, or a specific ID to get messages after it.
 */
export async function getChatHistory(areaTag: string, count: number = 50): Promise<ChatMessage[]> {
  const redis = getRedisClient();
  const key = areaTag === '_all' ? 'tdn:chat:_all' : `tdn:chat:${areaTag}`;

  // XREVRANGE gets newest first, then we reverse for chronological order
  const entries = await redis.xrevrange(key, '+', '-', 'COUNT', count);
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
