import { apiGet, apiPost, apiDelete } from './client';
import type { ServerStatus, OnlinePlayer, AreaPopulation, ChatMessage, ActivityEvent } from '../types';

export function getServerStatus(): Promise<ServerStatus> {
  return apiGet('/api/live/status');
}

export function getOnlinePlayers(): Promise<OnlinePlayer[]> {
  return apiGet('/api/live/players');
}

export function getAreaPopulations(): Promise<AreaPopulation[]> {
  return apiGet('/api/live/areas');
}

export function getChatHistory(area: string = '_all', count: number = 100): Promise<ChatMessage[]> {
  return apiGet(`/api/live/chat/history?area=${encodeURIComponent(area)}&count=${count}`);
}

export function searchChat(area: string, query: string, count: number = 100): Promise<ChatMessage[]> {
  return apiGet(`/api/live/chat/search?area=${encodeURIComponent(area)}&q=${encodeURIComponent(query)}&count=${count}`);
}

export function getChatBefore(area: string, beforeId: string, count: number = 50): Promise<ChatMessage[]> {
  return apiGet(`/api/live/chat/before?area=${encodeURIComponent(area)}&before=${encodeURIComponent(beforeId)}&count=${count}`);
}

export interface AreaAnalytics {
  areaTag: string;
  areaName: string;
  allTime: number;
  today: number;
  week: number;
  month: number;
}

export interface DailyHistory {
  dayIndex: number;
  date: string;
  totalVisits: number;
}

export function getAreaAnalytics(): Promise<AreaAnalytics[]> {
  return apiGet('/api/live/analytics/areas');
}

export function getDailyHistory(days: number = 30): Promise<DailyHistory[]> {
  return apiGet(`/api/live/analytics/daily?days=${days}`);
}

// Area graph types (from parse_areas.py output)
export interface AreaGraphNode {
  id: string;
  name: string;
  tag: string;
  region: string;
  connections: number;
  width: number;
  height: number;
  tileset: string;
  areaType: 'exterior' | 'interior' | 'underground' | 'dungeon';
  isInterior: boolean;
  isUnderground: boolean;
  isDungeon: boolean;
  dungeonLevel?: number;
  x: number;
  y: number;
  positioned: boolean;
}

export interface AreaGraphLink {
  source: string;
  target: string;
  label: string;
  type: 'door' | 'trigger';
  direction: 'north' | 'south' | 'east' | 'west' | 'interior';
  sourceX: number;
  sourceY: number;
}

export interface AreaGraphData {
  nodes: AreaGraphNode[];
  links: AreaGraphLink[];
  regions: string[];
  stats: {
    totalAreas: number;
    totalLinks: number;
    orphanCount: number;
    regionCount: number;
    interiorCount: number;
    dungeonCount: number;
    positionedCount: number;
  };
}

export function getAreaGraph(): Promise<AreaGraphData> {
  return apiGet('/api/live/analytics/area-graph');
}

export interface AreaTransition {
  from: string;
  to: string;
  count: number;
}

export function getAreaTransitions(): Promise<AreaTransition[]> {
  return apiGet('/api/live/analytics/area-transitions');
}

export interface PlayerSessionSummary {
  totalPlaytime: number;
  sessions: { login: number; logout: number; duration: number; name: string }[];
  currentSessionStart: number | null;
  todayPlaytime: number;
  weekPlaytime: number;
}

export function getPlayerSessions(uuid: string): Promise<PlayerSessionSummary> {
  return apiGet(`/api/live/sessions/${encodeURIComponent(uuid)}`);
}

export interface DMNote {
  id: number;
  player_uuid: string;
  character_name: string;
  note: string;
  author_discord_id: string;
  author_username: string;
  created_at: string;
}

export function getPlayerNotes(uuid: string): Promise<DMNote[]> {
  return apiGet(`/api/live/notes/${encodeURIComponent(uuid)}`);
}

export function addPlayerNote(uuid: string, note: string, characterName: string): Promise<DMNote> {
  return apiPost(`/api/live/notes/${encodeURIComponent(uuid)}`, { note, characterName });
}

export function deletePlayerNote(uuid: string, noteId: number): Promise<void> {
  return apiDelete(`/api/live/notes/${encodeURIComponent(uuid)}/${noteId}`);
}

export function getCharacterInfo(uuid: string): Promise<Record<string, any>> {
  return apiGet(`/api/live/charinfo/${encodeURIComponent(uuid)}`);
}

export function getActivityHistory(count: number = 100): Promise<ActivityEvent[]> {
  return apiGet(`/api/live/feed/history?count=${count}`);
}

/**
 * Subscribe to a Server-Sent Events stream.
 * Returns a cleanup function to close the connection.
 */
export function subscribeSSE<T>(
  url: string,
  onMessage: (data: T) => void,
  onError?: (err: Event) => void,
): () => void {
  const source = new EventSource(url, { withCredentials: true });

  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as T;
      onMessage(data);
    } catch {
      // Ignore malformed messages
    }
  };

  source.onerror = (err) => {
    onError?.(err);
  };

  return () => {
    source.close();
  };
}

export function subscribeChatStream(area: string, onMessage: (msg: ChatMessage) => void): () => void {
  return subscribeSSE(`/api/live/stream/chat?area=${encodeURIComponent(area)}`, onMessage);
}

export function subscribeActivityFeed(onMessage: (evt: ActivityEvent) => void): () => void {
  return subscribeSSE('/api/live/stream/feed', onMessage);
}

export function subscribePlayerStream(onMessage: (data: { players: OnlinePlayer[]; areas: AreaPopulation[]; status: ServerStatus }) => void): () => void {
  return subscribeSSE('/api/live/stream/players', onMessage);
}
