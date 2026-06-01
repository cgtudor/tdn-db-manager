import { useState } from 'react';
import { useActivityFeed } from '../hooks/useLive';
import { Badge } from '../components/ui/Badge';
import {
  Radio, Wifi, WifiOff,
  LogIn, LogOut, Skull, TrendingUp, Hammer, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const eventConfig: Record<string, { icon: LucideIcon; color: string; badge: 'success' | 'danger' | 'info' | 'warning' | 'default' }> = {
  login:   { icon: LogIn,      color: 'text-green-400',  badge: 'success' },
  logout:  { icon: LogOut,     color: 'text-text-muted',  badge: 'default' },
  death:   { icon: Skull,      color: 'text-red-400',    badge: 'danger' },
  levelup: { icon: TrendingUp, color: 'text-yellow-400', badge: 'warning' },
  craft:   { icon: Hammer,     color: 'text-blue-400',   badge: 'info' },
};

const defaultEventConfig = { icon: Zap, color: 'text-text-muted', badge: 'default' as const };

const EVENT_TYPES = ['login', 'logout', 'death', 'levelup', 'craft'] as const;

export function LiveFeed() {
  const { events, connected } = useActivityFeed();
  const [filters, setFilters] = useState<Set<string>>(new Set(EVENT_TYPES));

  const toggleFilter = (type: string) => {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const filteredEvents = events.filter((e) => filters.has(e.type));

  // Group by date
  const grouped: { date: string; events: typeof filteredEvents }[] = [];
  let currentDate = '';
  for (const evt of [...filteredEvents].reverse()) {
    const date = formatDate(evt.ts);
    if (date !== currentDate) {
      currentDate = date;
      grouped.push({ date, events: [] });
    }
    grouped[grouped.length - 1].events.push(evt);
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-text">
            <Radio className="h-4 w-4 inline mr-1.5" />Activity Feed
          </h1>
          {connected ? (
            <Badge variant="success">
              <span className="relative flex h-2 w-2 mr-1.5">
                <span className="animate-live-pulse absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              Live
            </Badge>
          ) : (
            <Badge variant="warning"><WifiOff className="h-3 w-3 inline mr-1" />Connecting</Badge>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1">
          {EVENT_TYPES.map((type) => {
            const cfg = eventConfig[type] || defaultEventConfig;
            const Icon = cfg.icon;
            const active = filters.has(type);
            return (
              <button
                key={type}
                onClick={() => toggleFilter(type)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                  active ? 'bg-surface-dim text-text' : 'text-text-muted/40 hover:text-text-muted'
                }`}
              >
                <Icon className="h-3 w-3" />
                {type}
              </button>
            );
          })}
        </div>
      </div>

      {/* Event list */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {filteredEvents.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-text-muted text-sm">
            <Radio className="h-5 w-5 mr-2" />
            {connected ? 'No events matching filters' : 'Connecting...'}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {grouped.map((group) => (
              <div key={group.date}>
                <div className="px-3 py-1.5 bg-surface-dim text-xs font-medium text-text-muted uppercase tracking-wider sticky top-0">
                  {group.date}
                </div>
                {group.events.map((evt) => {
                  const cfg = eventConfig[evt.type] || defaultEventConfig;
                  const Icon = cfg.icon;
                  return (
                    <div key={evt.id} className="flex items-start gap-3 px-3 py-2 hover:bg-surface-hover">
                      <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${cfg.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">
                          <span className="font-medium text-text">{evt.player}</span>
                          <span className="text-text-muted ml-1.5">{evt.detail}</span>
                        </div>
                        {evt.area && (
                          <div className="text-xs text-text-muted mt-0.5">{evt.area}</div>
                        )}
                      </div>
                      <span className="text-xs text-text-muted tabular-nums flex-shrink-0">
                        {formatTime(evt.ts)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
