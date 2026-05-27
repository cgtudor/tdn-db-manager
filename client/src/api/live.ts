import { apiGet } from './client';
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
