import { useLiveOverview } from '../hooks/useLive';
import { Loading } from '../components/shared/Loading';
import { EmptyState } from '../components/shared/EmptyState';
import { Badge } from '../components/ui/Badge';
import { Users, MapPin, Heart, Clock, Wifi, WifiOff, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function formatDuration(loginTime: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - loginTime;
  if (diff < 60) return '<1m';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  const hours = Math.floor(diff / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  return `${hours}h ${mins}m`;
}

function formatLastHeartbeat(ts: number): string {
  if (!ts) return 'Never';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 10) return 'Just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function LiveDashboard() {
  const { players, areas, status, connected, isLoading } = useLiveOverview();
  const navigate = useNavigate();

  if (isLoading) return <Loading message="Connecting to server..." />;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text">Live Server</h1>
        <div className="flex items-center gap-2">
          {connected ? (
            <Badge variant="success"><Wifi className="h-3 w-3 inline mr-1" />Live</Badge>
          ) : (
            <Badge variant="warning"><WifiOff className="h-3 w-3 inline mr-1" />Connecting</Badge>
          )}
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-text-muted text-xs font-medium uppercase tracking-wider">
            <Users className="h-3.5 w-3.5" /> Players Online
          </div>
          <div className="text-3xl font-bold text-text mt-1">{status.playerCount}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-text-muted text-xs font-medium uppercase tracking-wider">
            <MapPin className="h-3.5 w-3.5" /> Active Areas
          </div>
          <div className="text-3xl font-bold text-text mt-1">{areas.length}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-text-muted text-xs font-medium uppercase tracking-wider">
            <Activity className="h-3.5 w-3.5" /> Last Heartbeat
          </div>
          <div className="text-3xl font-bold text-text mt-1">{formatLastHeartbeat(status.lastHeartbeat)}</div>
          <div className="text-xs text-text-muted mt-0.5">
            Redis: {status.redisConnected ? <span className="text-green-500">Connected</span> : <span className="text-red-500">Disconnected</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Area populations */}
        <section>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">
            <MapPin className="h-3.5 w-3.5 inline mr-1" />
            Area Populations
          </h2>
          <div className="rounded-lg border border-border bg-surface overflow-hidden">
            {areas.length === 0 ? (
              <EmptyState icon={MapPin} title="No active areas" description="No players are online" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-dim text-text-secondary text-left">
                    <th className="px-3 py-2 font-medium">Area</th>
                    <th className="px-3 py-2 font-medium text-right">Players</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {areas.map((area) => (
                    <tr
                      key={area.areaTag}
                      className="hover:bg-surface-hover cursor-pointer"
                      onClick={() => navigate(`/live/chat?area=${area.areaTag}`)}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">{area.areaTag}</div>
                        <div className="text-xs text-text-muted">
                          {area.players.map((p) => p.name).join(', ')}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Badge>{area.playerCount}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Online players */}
        <section>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">
            <Users className="h-3.5 w-3.5 inline mr-1" />
            Online Players
          </h2>
          <div className="rounded-lg border border-border bg-surface overflow-hidden">
            {players.length === 0 ? (
              <EmptyState icon={Users} title="No players online" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-dim text-text-secondary text-left">
                    <th className="px-3 py-2 font-medium">Character</th>
                    <th className="px-3 py-2 font-medium">Area</th>
                    <th className="px-3 py-2 font-medium text-center">HP</th>
                    <th className="px-3 py-2 font-medium text-center">Lv</th>
                    <th className="px-3 py-2 font-medium text-right">Session</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {players.map((p) => (
                    <tr key={p.uuid} className="hover:bg-surface-hover">
                      <td className="px-3 py-1.5">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-text-muted">{p.player}</div>
                      </td>
                      <td className="px-3 py-1.5 text-text-muted text-xs">{p.area}</td>
                      <td className="px-3 py-1.5 text-center">
                        <span className="inline-flex items-center gap-0.5 text-xs tabular-nums">
                          <Heart className="h-3 w-3 text-red-400" />{p.hp}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-center tabular-nums">{p.level}</td>
                      <td className="px-3 py-1.5 text-right text-text-muted text-xs">
                        <Clock className="h-3 w-3 inline mr-0.5" />{formatDuration(p.loginTime)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
