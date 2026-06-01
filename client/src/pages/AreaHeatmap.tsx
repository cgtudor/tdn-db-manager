import { useState, useMemo, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAreaAnalytics, getDailyHistory, getAreaGraph, getAreaTransitions } from '../api/live';
import type { AreaAnalytics } from '../api/live';
import { Loading } from '../components/shared/Loading';
import { EmptyState } from '../components/shared/EmptyState';
import {
  Map, TrendingUp, BarChart3, ArrowUpDown, Eye, EyeOff,
  Flame, Snowflake, Calendar, Network,
} from 'lucide-react';

const AreaMapView = lazy(() => import('../components/AreaMapView').then(m => ({ default: m.AreaMapView })));

type SortField = 'today' | 'week' | 'month' | 'allTime' | 'areaName';
type SortDir = 'asc' | 'desc';
type TimeRange = 'today' | 'week' | 'month' | 'allTime';

function heatColor(value: number, max: number): string {
  if (max === 0 || value === 0) return 'bg-surface-dim';
  const ratio = value / max;
  if (ratio > 0.8) return 'bg-red-500/80';
  if (ratio > 0.6) return 'bg-orange-500/70';
  if (ratio > 0.4) return 'bg-yellow-500/60';
  if (ratio > 0.2) return 'bg-green-500/50';
  if (ratio > 0.05) return 'bg-emerald-500/30';
  return 'bg-surface-dim';
}

function heatTextColor(value: number, max: number): string {
  if (max === 0 || value === 0) return 'text-text-muted';
  const ratio = value / max;
  if (ratio > 0.4) return 'text-white';
  return 'text-text';
}

/** Extract region from area display name (e.g. "Murann" from "Murann: Arbas Square - The Low Dog Alehouse") */
function getRegion(area: AreaAnalytics): string {
  const name = area.areaName;
  if (name.includes(':')) return name.split(':')[0].trim();
  return 'Other';
}

/** Get the short area name (part after the colon, or the full name if no colon) */
function getShortName(name: string): string {
  if (name.includes(':')) return name.split(':').slice(1).join(':').trim();
  return name;
}

function MiniBar({ value, max, className = '' }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div className={`h-2 w-16 bg-surface-dim rounded-full overflow-hidden ${className}`}>
      <div
        className="h-full bg-primary rounded-full transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function DailyChart({ data }: { data: { date: string; totalVisits: number }[] }) {
  // Only show days from the first day that has data
  const firstDataIdx = data.findIndex(d => d.totalVisits > 0);
  const visibleData = firstDataIdx >= 0 ? data.slice(firstDataIdx) : data;
  const max = Math.max(...visibleData.map(d => d.totalVisits), 1);
  const totalVisits = visibleData.reduce((s, d) => s + d.totalVisits, 0);

  if (totalVisits === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          <Calendar className="h-3.5 w-3.5 inline mr-1" />
          Daily Area Transitions
        </h3>
        <span className="text-xs text-text-muted">{totalVisits.toLocaleString()} total</span>
      </div>
      <div className="flex items-end gap-px h-32 border-b border-border/50">
        {visibleData.map((d, i) => {
          const height = (d.totalVisits / max) * 100;
          const isToday = i === visibleData.length - 1;
          return (
            <div
              key={d.date}
              className="flex-1 flex flex-col items-center justify-end group relative min-w-[3px]"
            >
              <div
                className={`w-full rounded-t transition-colors ${isToday ? 'bg-indigo-400' : 'bg-indigo-500/70 group-hover:bg-indigo-400'}`}
                style={{ height: `${Math.max(height, d.totalVisits > 0 ? 6 : 0)}%` }}
              />
              <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                <div className="bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap">
                  {d.date}: {d.totalVisits.toLocaleString()} visits
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-text-muted">
        <span>{visibleData[0]?.date}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

function HeatmapGrid({ areas, timeRange }: { areas: AreaAnalytics[]; timeRange: TimeRange }) {
  const grouped = useMemo(() => {
    const groups: Record<string, AreaAnalytics[]> = {};
    for (const a of areas) {
      const region = getRegion(a);
      if (!groups[region]) groups[region] = [];
      groups[region].push(a);
    }
    return Object.entries(groups)
      .map(([region, items]) => ({
        region,
        items: items.sort((a, b) => b[timeRange] - a[timeRange]),
        total: items.reduce((sum, a) => sum + a[timeRange], 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [areas, timeRange]);

  const globalMax = Math.max(...areas.map(a => a[timeRange]), 1);

  return (
    <div className="space-y-3">
      {grouped.map(({ region, items, total }) => (
        <div key={region}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{region}</span>
            <span className="text-[10px] text-text-muted">({items.length} areas, {total.toLocaleString()} visits)</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {items.map((a) => {
              const val = a[timeRange];
              return (
                <div
                  key={a.areaTag}
                  className={`${heatColor(val, globalMax)} ${heatTextColor(val, globalMax)}
                    rounded px-2 py-1 text-[10px] leading-tight cursor-default
                    transition-all hover:ring-1 hover:ring-primary/50 group relative`}
                  title={`${a.areaName}\n${a.areaTag}\n${val.toLocaleString()} visits`}
                >
                  <div className="font-medium truncate max-w-32">{getShortName(a.areaName) || a.areaTag}</div>
                  <div className="tabular-nums">{val.toLocaleString()}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AreaHeatmap() {
  const [sortField, setSortField] = useState<SortField>('week');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  const [showDead, setShowDead] = useState(false);
  const [view, setView] = useState<'table' | 'heatmap' | 'map'>('heatmap');

  const { data: areas, isLoading: areasLoading } = useQuery({
    queryKey: ['area-analytics'],
    queryFn: getAreaAnalytics,
    staleTime: 60_000,
  });

  const { data: dailyHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['daily-history'],
    queryFn: () => getDailyHistory(30),
    staleTime: 60_000,
  });

  const { data: graphData } = useQuery({
    queryKey: ['area-graph'],
    queryFn: getAreaGraph,
    staleTime: 5 * 60_000,
    enabled: view === 'map',
  });

  const { data: transitions } = useQuery({
    queryKey: ['area-transitions'],
    queryFn: getAreaTransitions,
    staleTime: 60_000,
    enabled: view === 'map',
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortedAreas = useMemo(() => {
    if (!areas) return [];
    let filtered = showDead ? areas : areas.filter(a => a[timeRange] > 0 || a.allTime > 0);
    return [...filtered].sort((a, b) => {
      const aVal = sortField === 'areaName' ? a.areaName : a[sortField];
      const bVal = sortField === 'areaName' ? b.areaName : b[sortField];
      if (typeof aVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [areas, sortField, sortDir, timeRange, showDead]);

  const stats = useMemo(() => {
    if (!areas) return { totalToday: 0, activeAreas: 0, busiestArea: '', deadAreas: 0 };
    const totalToday = areas.reduce((s, a) => s + a.today, 0);
    const activeAreas = areas.filter(a => a[timeRange] > 0).length;
    const deadAreas = areas.filter(a => a.month === 0).length;
    const busiest = [...areas].sort((a, b) => b[timeRange] - a[timeRange])[0];
    return { totalToday, activeAreas, busiestArea: busiest?.areaName || '-', deadAreas };
  }, [areas, timeRange]);

  if (areasLoading) return <Loading message="Loading analytics..." />;

  const maxForRange = Math.max(...(sortedAreas.map(a => a[timeRange])), 1);

  return (
    <div className="px-6 py-4 space-y-6 overflow-y-auto h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text">
          <Map className="h-5 w-5 inline mr-1.5" />Area Analytics
        </h1>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setView('heatmap')}
              className={`px-3 py-1 text-xs ${view === 'heatmap' ? 'bg-primary text-white' : 'bg-surface text-text-muted hover:text-text'}`}
            >
              <Flame className="h-3 w-3 inline mr-1" />Heatmap
            </button>
            <button
              onClick={() => setView('table')}
              className={`px-3 py-1 text-xs ${view === 'table' ? 'bg-primary text-white' : 'bg-surface text-text-muted hover:text-text'}`}
            >
              <BarChart3 className="h-3 w-3 inline mr-1" />Table
            </button>
            <button
              onClick={() => setView('map')}
              className={`px-3 py-1 text-xs ${view === 'map' ? 'bg-primary text-white' : 'bg-surface text-text-muted hover:text-text'}`}
            >
              <Network className="h-3 w-3 inline mr-1" />Map
            </button>
          </div>

          {/* Time range */}
          {(['today', 'week', 'month', 'allTime'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTimeRange(t)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                timeRange === t ? 'bg-primary text-white' : 'bg-surface-dim text-text-muted hover:text-text'
              }`}
            >
              {t === 'allTime' ? 'All Time' : t === 'today' ? 'Today' : t === 'week' ? '7 Days' : '30 Days'}
            </button>
          ))}

          <button
            onClick={() => setShowDead(!showDead)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
              showDead ? 'bg-surface-dim text-text' : 'text-text-muted hover:text-text'
            }`}
            title="Show areas with zero visits"
          >
            {showDead ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            Dead
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-text-muted text-xs font-medium uppercase tracking-wider">
            <TrendingUp className="h-3.5 w-3.5" /> Visits Today
          </div>
          <div className="text-3xl font-bold text-text mt-1">{stats.totalToday.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-text-muted text-xs font-medium uppercase tracking-wider">
            <Map className="h-3.5 w-3.5" /> Active Areas
          </div>
          <div className="text-3xl font-bold text-text mt-1">{stats.activeAreas}</div>
          <div className="text-xs text-text-muted mt-0.5">of {areas?.length || 0} total</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-text-muted text-xs font-medium uppercase tracking-wider">
            <Flame className="h-3.5 w-3.5" /> Busiest Area
          </div>
          <div className="text-sm font-bold text-text mt-1 truncate">{stats.busiestArea}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-text-muted text-xs font-medium uppercase tracking-wider">
            <Snowflake className="h-3.5 w-3.5" /> Dead Areas
          </div>
          <div className="text-3xl font-bold text-text mt-1">{stats.deadAreas}</div>
          <div className="text-xs text-text-muted mt-0.5">no visits in 30 days</div>
        </div>
      </div>

      {/* Daily chart */}
      {!historyLoading && dailyHistory && dailyHistory.length > 0 && (
        <DailyChart data={dailyHistory} />
      )}

      {/* Map / Heatmap / Table view */}
      {view === 'map' ? (
        <div className="relative">
          {graphData ? (
            <Suspense fallback={<Loading message="Loading map..." />}>
              <AreaMapView graphData={graphData} analytics={areas} transitions={transitions} timeRange={timeRange} />
            </Suspense>
          ) : (
            <Loading message="Loading area graph..." />
          )}
        </div>
      ) : view === 'heatmap' ? (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
            <Flame className="h-3.5 w-3.5 inline mr-1" />
            Area Heatmap — {timeRange === 'allTime' ? 'All Time' : timeRange === 'today' ? 'Today' : timeRange === 'week' ? 'Last 7 Days' : 'Last 30 Days'}
          </h3>
          {sortedAreas.length === 0 ? (
            <EmptyState icon={Map} title="No area data" description="Visit data will appear once players explore areas" />
          ) : (
            <HeatmapGrid areas={sortedAreas} timeRange={timeRange} />
          )}
          {/* Legend */}
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
            <span className="text-[10px] text-text-muted uppercase tracking-wider">Activity:</span>
            <div className="flex items-center gap-1">
              <div className="w-4 h-3 rounded bg-surface-dim" />
              <span className="text-[10px] text-text-muted">None</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-3 rounded bg-emerald-500/30" />
              <span className="text-[10px] text-text-muted">Low</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-3 rounded bg-green-500/50" />
              <span className="text-[10px] text-text-muted">Medium</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-3 rounded bg-yellow-500/60" />
              <span className="text-[10px] text-text-muted">High</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-3 rounded bg-orange-500/70" />
              <span className="text-[10px] text-text-muted">Very High</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-3 rounded bg-red-500/80" />
              <span className="text-[10px] text-text-muted">Hotspot</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface overflow-x-auto">
          {sortedAreas.length === 0 ? (
            <EmptyState icon={Map} title="No area data" />
          ) : (
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-border bg-surface-dim text-text-secondary text-left">
                  <SortHeader label="Area" field="areaName" current={sortField} dir={sortDir} onClick={toggleSort} />
                  <SortHeader label="Today" field="today" current={sortField} dir={sortDir} onClick={toggleSort} className="text-right" />
                  <SortHeader label="7 Days" field="week" current={sortField} dir={sortDir} onClick={toggleSort} className="text-right" />
                  <SortHeader label="30 Days" field="month" current={sortField} dir={sortDir} onClick={toggleSort} className="text-right" />
                  <SortHeader label="All Time" field="allTime" current={sortField} dir={sortDir} onClick={toggleSort} className="text-right" />
                  <th className="px-3 py-2 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedAreas.map((a) => (
                  <tr key={a.areaTag} className="hover:bg-surface-hover odd:bg-surface-dim/40">
                    <td className="px-3 py-1.5">
                      <div className="font-medium">{a.areaName}</div>
                      <div className="text-xs text-text-muted font-mono">{a.areaTag}</div>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {a.today > 0 ? a.today.toLocaleString() : <span className="text-text-muted">-</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {a.week > 0 ? a.week.toLocaleString() : <span className="text-text-muted">-</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {a.month > 0 ? a.month.toLocaleString() : <span className="text-text-muted">-</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {a.allTime > 0 ? a.allTime.toLocaleString() : <span className="text-text-muted">-</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      <MiniBar value={a[timeRange]} max={maxForRange} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="px-3 py-1.5 border-t border-border text-xs text-text-muted bg-surface-dim">
            {sortedAreas.length} areas
          </div>
        </div>
      )}
    </div>
  );
}

function SortHeader({ label, field, current, dir, onClick, className = '' }: {
  label: string;
  field: SortField;
  current: SortField;
  dir: SortDir;
  onClick: (f: SortField) => void;
  className?: string;
}) {
  const isActive = current === field;
  return (
    <th
      className={`px-3 py-2 font-medium cursor-pointer select-none hover:text-text ${className}`}
      onClick={() => onClick(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && (
          <ArrowUpDown className={`h-3 w-3 ${dir === 'asc' ? 'rotate-180' : ''}`} />
        )}
      </span>
    </th>
  );
}
