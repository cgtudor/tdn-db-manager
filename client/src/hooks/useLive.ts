import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as liveApi from '../api/live';
import type { OnlinePlayer, AreaPopulation, ServerStatus, ChatMessage, ActivityEvent } from '../types';

const MAX_CHAT_MESSAGES = 500;
const MAX_FEED_EVENTS = 200;

/**
 * Live player/area/status data via SSE with REST fallback for initial load.
 */
export function useLiveOverview() {
  const [players, setPlayers] = useState<OnlinePlayer[]>([]);
  const [areas, setAreas] = useState<AreaPopulation[]>([]);
  const [status, setStatus] = useState<ServerStatus>({ playerCount: 0, lastHeartbeat: 0, redisConnected: false });
  const [connected, setConnected] = useState(false);

  // Initial REST load
  const { isLoading } = useQuery({
    queryKey: ['live-overview-init'],
    queryFn: async () => {
      const [p, a, s] = await Promise.all([
        liveApi.getOnlinePlayers(),
        liveApi.getAreaPopulations(),
        liveApi.getServerStatus(),
      ]);
      setPlayers(p);
      setAreas(a);
      setStatus(s);
      return true;
    },
    staleTime: Infinity, // Only fetch once, SSE takes over
  });

  // SSE subscription
  useEffect(() => {
    const cleanup = liveApi.subscribePlayerStream((data) => {
      setPlayers(data.players);
      setAreas(data.areas);
      setStatus(data.status);
      setConnected(true);
    });

    return cleanup;
  }, []);

  return { players, areas, status, connected, isLoading };
}

/**
 * Chat messages for a specific area (or all areas).
 * Loads history via REST then appends live messages via SSE.
 */
export function useChatStream(area: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const clearMessages = useCallback(() => setMessages([]), []);

  // Load history when area changes
  useEffect(() => {
    setMessages([]);
    setConnected(false);

    let cancelled = false;
    liveApi.getChatHistory(area, 100).then((history) => {
      if (!cancelled) setMessages(history);
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [area]);

  // SSE subscription
  useEffect(() => {
    const cleanup = liveApi.subscribeChatStream(area, (msg) => {
      setConnected(true);
      setMessages((prev) => {
        const next = [...prev, msg];
        return next.length > MAX_CHAT_MESSAGES ? next.slice(-MAX_CHAT_MESSAGES) : next;
      });
    });

    return cleanup;
  }, [area]);

  return { messages, connected, clearMessages };
}

/**
 * Activity feed with history + SSE live updates.
 */
export function useActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [connected, setConnected] = useState(false);

  // Load history
  useEffect(() => {
    liveApi.getActivityHistory(100).then((history) => {
      setEvents(history);
    }).catch(() => {});
  }, []);

  // SSE subscription
  useEffect(() => {
    const cleanup = liveApi.subscribeActivityFeed((evt) => {
      setConnected(true);
      setEvents((prev) => {
        const next = [...prev, evt];
        return next.length > MAX_FEED_EVENTS ? next.slice(-MAX_FEED_EVENTS) : next;
      });
    });

    return cleanup;
  }, []);

  return { events, connected };
}
