import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLiveOverview } from '../hooks/useLive';
import { getCharacterInfo, getPlayerSessions, getPlayerNotes, addPlayerNote, deletePlayerNote } from '../api/live';
import { Loading } from '../components/shared/Loading';
import { EmptyState } from '../components/shared/EmptyState';
import { Badge } from '../components/ui/Badge';
import { useAuth } from '../hooks/useAuth';
import {
  Users, MapPin, Heart, Clock, Wifi, WifiOff, Activity,
  X, Shield, Coins, Sword, BookOpen, Star, Briefcase,
  StickyNote, Send, Trash2,
} from 'lucide-react';
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

function InfoRow({ label, value, icon: Icon }: { label: string; value: string | number | undefined; icon?: React.ElementType }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border last:border-0">
      {Icon && <Icon className="h-3.5 w-3.5 text-text-muted mt-0.5 flex-shrink-0" />}
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
        <div className="text-sm text-text">{value}</div>
      </div>
    </div>
  );
}

function formatPlaytime(seconds: number): string {
  if (seconds < 60) return '<1m';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatSessionTime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const dateStr = d.toDateString() === now.toDateString() ? 'Today' : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${dateStr} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function CharacterPanel({ uuid, onClose }: { uuid: string; onClose: () => void }) {
  const { data: info, isLoading } = useQuery({
    queryKey: ['charinfo', uuid],
    queryFn: () => getCharacterInfo(uuid),
    staleTime: 30_000,
  });

  const { data: sessions } = useQuery({
    queryKey: ['sessions', uuid],
    queryFn: () => getPlayerSessions(uuid),
    staleTime: 30_000,
  });

  const { data: notes, refetch: refetchNotes } = useQuery({
    queryKey: ['dm-notes', uuid],
    queryFn: () => getPlayerNotes(uuid),
    staleTime: 30_000,
  });

  const { user: currentUser } = useAuth();
  const [newNote, setNewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="w-80 flex-shrink-0 border-l border-border bg-surface overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface-dim">
        <h3 className="text-sm font-semibold text-text">Character Info</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <Loading message="Loading..." />
      ) : !info ? (
        <EmptyState title="No data" description="Character info not available" />
      ) : (
        <div className="px-3 py-2">
          {/* Header */}
          <div className="pb-2 mb-1 border-b border-border">
            <div className="text-lg font-bold text-text">{info.name}</div>
            <div className="text-xs text-text-muted">{info.player} ({info.cdkey})</div>
          </div>

          {/* Core stats */}
          <div className="grid grid-cols-2 gap-x-3">
            <InfoRow label="Race" value={info.subrace ? `${info.race} (${info.subrace})` : info.race} />
            <InfoRow label="Level" value={info.level} />
          </div>
          <InfoRow label="Classes" value={info.classes} icon={Sword} />
          <InfoRow label="Alignment" value={info.alignment} icon={Shield} />
          <InfoRow label="HP" value={info.hp} icon={Heart} />

          {/* XP */}
          <div className="grid grid-cols-2 gap-x-3">
            <InfoRow label="XP" value={info.xp?.toLocaleString()} icon={Star} />
            <InfoRow label="Level" value={info.level} />
          </div>

          {/* Wealth */}
          <div className="grid grid-cols-2 gap-x-3">
            <InfoRow label="Gold" value={info.gold?.toLocaleString()} icon={Coins} />
            <InfoRow label="Banked Silver" value={info.bankedSilver?.toLocaleString()} />
          </div>

          {/* Character details */}
          <InfoRow label="Deity" value={info.deity} icon={BookOpen} />
          <InfoRow label="Background" value={info.background} />
          <InfoRow label="Origin" value={info.origin} />
          <InfoRow label="Social Class" value={info.social} />

          {/* Faction */}
          {info.faction && info.faction !== 'None' && (
            <>
              <InfoRow label="Faction" value={info.faction} icon={Briefcase} />
              <div className="grid grid-cols-2 gap-x-3">
                <InfoRow label="Rank" value={info.factionRank} />
                <InfoRow label="Reputation" value={info.factionRep} />
              </div>
            </>
          )}

          {/* Professions */}
          <InfoRow label="Professions" value={info.professions} />

          {/* Optional fields */}
          {info.warlockCreed && <InfoRow label="Warlock Creed" value={info.warlockCreed} />}
          {info.paladinOrder && <InfoRow label="Paladin Order" value={info.paladinOrder} />}
          {info.monkOrder && <InfoRow label="Monk Order" value={info.monkOrder} />}

          {/* Renown */}
          {(info.preludeRenown > 0 || info.trademeetRenown > 0) && (
            <div className="grid grid-cols-2 gap-x-3">
              <InfoRow label="Prelude Renown" value={info.preludeRenown} />
              <InfoRow label="Trademeet Renown" value={info.trademeetRenown} />
            </div>
          )}

          {/* Bio reward */}
          <div className="mt-2 pt-2 border-t border-border">
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              Bio Reward: {info.bioReward ? (
                <Badge variant="success">Claimed</Badge>
              ) : (
                <Badge variant="default">Unclaimed</Badge>
              )}
            </div>
          </div>

          {/* DM Notes */}
          <div className="mt-2 pt-2 border-t border-border">
            <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">
              <StickyNote className="h-3 w-3 inline mr-1" />DM Notes ({notes?.length || 0})
            </div>

            {/* Add note */}
            <div className="flex gap-1 mb-2">
              <input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newNote.trim() && !submitting) {
                    setSubmitting(true);
                    addPlayerNote(uuid, newNote.trim(), info?.name || 'Unknown').then(() => {
                      setNewNote('');
                      refetchNotes();
                    }).finally(() => setSubmitting(false));
                  }
                }}
                placeholder="Add a note..."
                className="flex-1 text-xs px-2 py-1 rounded border border-border bg-surface-dim focus:outline-none focus:ring-1 focus:ring-primary/30"
                disabled={submitting}
              />
              <button
                onClick={() => {
                  if (!newNote.trim() || submitting) return;
                  setSubmitting(true);
                  addPlayerNote(uuid, newNote.trim(), info?.name || 'Unknown').then(() => {
                    setNewNote('');
                    refetchNotes();
                  }).finally(() => setSubmitting(false));
                }}
                disabled={!newNote.trim() || submitting}
                className="p-1 rounded text-text-muted hover:text-primary disabled:opacity-30"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Note list */}
            {notes && notes.length > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {notes.map((n) => (
                  <div key={n.id} className="rounded bg-surface-dim px-2 py-1.5 text-xs group">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-text whitespace-pre-wrap break-words min-w-0">{n.note}</p>
                      {(n.author_discord_id === currentUser?.id || currentUser?.role === 'admin') && (
                        <button
                          onClick={() => {
                            deletePlayerNote(uuid, n.id).then(() => refetchNotes());
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-muted hover:text-red-400 flex-shrink-0"
                          title="Delete note"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <div className="text-[10px] text-text-muted mt-0.5">
                      {n.author_username} — {new Date(n.created_at + 'Z').toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Session history */}
          {sessions && (
            <div className="mt-2 pt-2 border-t border-border">
              <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">
                <Clock className="h-3 w-3 inline mr-1" />Play Time
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="rounded bg-surface-dim px-2 py-1 text-center">
                  <div className="text-xs font-bold text-text">{formatPlaytime(sessions.todayPlaytime)}</div>
                  <div className="text-[9px] text-text-muted">Today</div>
                </div>
                <div className="rounded bg-surface-dim px-2 py-1 text-center">
                  <div className="text-xs font-bold text-text">{formatPlaytime(sessions.weekPlaytime)}</div>
                  <div className="text-[9px] text-text-muted">7 Days</div>
                </div>
                <div className="rounded bg-surface-dim px-2 py-1 text-center">
                  <div className="text-xs font-bold text-text">{formatPlaytime(sessions.totalPlaytime)}</div>
                  <div className="text-[9px] text-text-muted">Total</div>
                </div>
              </div>
              {sessions.currentSessionStart && (
                <div className="text-xs text-green-400 mb-1.5">
                  Currently online ({formatPlaytime(Math.floor(Date.now() / 1000) - sessions.currentSessionStart)})
                </div>
              )}
              {sessions.sessions.length > 0 && (
                <>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Recent Sessions</div>
                  <div className="space-y-0.5 max-h-40 overflow-y-auto">
                    {sessions.sessions.map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-0.5">
                        <span className="text-text-muted">{formatSessionTime(s.login)}</span>
                        <span className="text-text tabular-nums">{formatPlaytime(s.duration)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function LiveDashboard() {
  const { players, areas, status, connected, isLoading } = useLiveOverview();
  const navigate = useNavigate();
  const [selectedUUID, setSelectedUUID] = useState<string | null>(null);

  if (isLoading) return <Loading message="Connecting to server..." />;

  return (
    <div className="flex gap-0 h-[calc(100vh-4rem)]">
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 max-w-6xl">
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
                          <div className="font-medium">{area.areaName}</div>
                          <div className="text-xs text-text-muted">
                            <span className="font-mono">{area.areaTag}</span>
                            {' — '}
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
                      <tr
                        key={p.uuid}
                        className={`cursor-pointer transition-colors ${
                          selectedUUID === p.uuid
                            ? 'bg-primary/10'
                            : 'hover:bg-surface-hover'
                        }`}
                        onClick={() => setSelectedUUID(selectedUUID === p.uuid ? null : p.uuid)}
                      >
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

      {/* Character detail panel */}
      {selectedUUID && (
        <CharacterPanel uuid={selectedUUID} onClose={() => setSelectedUUID(null)} />
      )}
    </div>
  );
}
