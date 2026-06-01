import { Link } from 'react-router-dom';
import { useDatabases } from '../hooks/useDatabases';
import { useAuth } from '../hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRecentAudit } from '../api/admin';
import { deleteDatabase } from '../api/databases';
import { getLootOverview } from '../api/loot';
import { getStores } from '../api/stores';
import { getServerStatus } from '../api/live';
import {
  Database, Swords, FlaskConical, HardDrive, Clock, ArrowRight, Trash2, Loader2,
  Store, Leaf, Users, Wifi, WifiOff,
} from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Loading } from '../components/shared/Loading';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Dashboard() {
  const { data: databases, isLoading } = useDatabases();
  const { isAdmin, isDM } = useAuth();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: recentAudit } = useQuery({
    queryKey: ['recentAudit'],
    queryFn: () => getRecentAudit(10),
    staleTime: 30_000,
  });

  const { data: lootOverview } = useQuery({
    queryKey: ['lootOverview'],
    queryFn: getLootOverview,
    staleTime: 60_000,
  });

  const { data: stores } = useQuery({
    queryKey: ['stores-count'],
    queryFn: () => getStores(),
    staleTime: 60_000,
  });

  const { data: serverStatus } = useQuery({
    queryKey: ['serverStatus'],
    queryFn: getServerStatus,
    staleTime: 10_000,
    enabled: isDM,
  });

  const deleteMutation = useMutation({
    mutationFn: (dbFilename: string) => deleteDatabase(dbFilename),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databases'] });
      setDeleteTarget(null);
    },
  });

  if (isLoading) return <Loading />;

  const totalLootItems = lootOverview?.reduce((sum, cat) =>
    sum + Object.values(cat.tierCounts).reduce((s, n) => s + n, 0), 0) ?? 0;
  const totalStores = stores?.length ?? 0;
  const totalTables = databases?.reduce((sum, db) => sum + db.tableCount, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Dashboard</h1>
        <p className="text-sm text-text-secondary mt-1">Manage TDN game databases</p>
      </div>

      {/* Server status bar (DM/Admin only) */}
      {isDM && serverStatus && (
        <div className="flex items-center gap-4 px-4 py-2.5 rounded-lg border border-border bg-surface text-sm">
          {serverStatus.redisConnected ? (
            <Badge variant="success">
              <span className="relative flex h-2 w-2 mr-1.5">
                <span className="animate-live-pulse absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              Server Online
            </Badge>
          ) : (
            <Badge variant="warning"><WifiOff className="h-3 w-3 inline mr-1" />Server Offline</Badge>
          )}
          <span className="flex items-center gap-1.5 text-text-secondary">
            <Users className="h-3.5 w-3.5" />
            {serverStatus.playerCount} player{serverStatus.playerCount !== 1 ? 's' : ''}
          </span>
          <Link to="/live" className="ml-auto text-xs text-primary hover:underline">
            Open Live Dashboard
          </Link>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-text-muted text-xs font-medium uppercase tracking-wider">
            <Database className="h-3.5 w-3.5" /> Tables
          </div>
          <div className="text-2xl font-bold text-text mt-1">{totalTables}</div>
          <div className="text-xs text-text-muted mt-0.5">{databases?.length ?? 0} databases</div>
        </div>
        <Link to="/loot" className="rounded-lg border border-border bg-surface p-4 hover:border-primary/40 transition-colors">
          <div className="flex items-center gap-2 text-text-muted text-xs font-medium uppercase tracking-wider">
            <Swords className="h-3.5 w-3.5" /> Loot Items
          </div>
          <div className="text-2xl font-bold text-text mt-1">{totalLootItems}</div>
          <div className="text-xs text-text-muted mt-0.5">{lootOverview?.length ?? 0} categories</div>
        </Link>
        <Link to="/stores" className="rounded-lg border border-border bg-surface p-4 hover:border-primary/40 transition-colors">
          <div className="flex items-center gap-2 text-text-muted text-xs font-medium uppercase tracking-wider">
            <Store className="h-3.5 w-3.5" /> Stores
          </div>
          <div className="text-2xl font-bold text-text mt-1">{totalStores}</div>
        </Link>
        <Link to="/ingredients" className="rounded-lg border border-border bg-surface p-4 hover:border-primary/40 transition-colors">
          <div className="flex items-center gap-2 text-text-muted text-xs font-medium uppercase tracking-wider">
            <Leaf className="h-3.5 w-3.5" /> Ingredients
          </div>
          <div className="text-2xl font-bold text-text mt-1 text-text-secondary text-lg">&mdash;</div>
        </Link>
      </div>

      {/* Two-column layout: Quick access + Recent changes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Quick access cards + DB grid */}
        <div className="space-y-6">
          {/* Quick access */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-text">Quick Access</h2>
            <Link
              to="/loot"
              className="flex items-center gap-4 p-5 rounded-xl border border-border bg-surface hover:border-primary hover:shadow-md transition-all group"
            >
              <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-3 group-hover:bg-amber-200 dark:group-hover:bg-amber-900/50 transition-colors">
                <Swords className="h-6 w-6 text-amber-700 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-text">Loot Editor</h3>
                <p className="text-sm text-text-secondary">
                  {totalLootItems > 0 ? `${totalLootItems} items across ${lootOverview?.length ?? 0} categories` : 'Manage tiered loot tables'}
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-text-muted group-hover:text-primary transition-colors" />
            </Link>

            <Link
              to="/crafting"
              className="flex items-center gap-4 p-5 rounded-xl border border-border bg-surface hover:border-primary hover:shadow-md transition-all group"
            >
              <div className="rounded-lg bg-purple-100 dark:bg-purple-900/30 p-3 group-hover:bg-purple-200 dark:group-hover:bg-purple-900/50 transition-colors">
                <FlaskConical className="h-6 w-6 text-purple-700 dark:text-purple-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-text">Crafting Editor</h3>
                <p className="text-sm text-text-secondary">Manage recipes and ingredients</p>
              </div>
              <ArrowRight className="h-5 w-5 text-text-muted group-hover:text-primary transition-colors" />
            </Link>
          </div>

          {/* Database grid */}
          <div>
            <h2 className="text-lg font-semibold text-text mb-3">Databases</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {databases?.map(db => (
                <div key={db.filename} className="relative flex items-start gap-3 p-4 rounded-lg border border-border bg-surface hover:border-primary/40 hover:shadow-sm transition-all">
                  <Link
                    to={`/db/${db.filename}`}
                    className="flex items-start gap-3 flex-1 min-w-0"
                  >
                    <Database className="h-5 w-5 text-text-muted mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-text truncate">{db.displayName}</span>
                        {db.editorAccess === 'write' && <Badge variant="success">editable</Badge>}
                      </div>
                      {db.description && (
                        <p className="text-xs text-text-secondary mt-0.5 truncate">{db.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-text-muted">
                        <span className="flex items-center gap-1">
                          <HardDrive className="h-3 w-3" />
                          {formatBytes(db.sizeBytes)}
                        </span>
                        <span>{db.tableCount} tables</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(db.lastModified), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </Link>
                  {isAdmin && (
                    <button
                      onClick={() => { deleteMutation.reset(); setDeleteTarget(db.filename); }}
                      className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex-shrink-0"
                      title="Delete database"
                      disabled={deleteMutation.isPending && deleteTarget === db.filename}
                    >
                      {deleteMutation.isPending && deleteTarget === db.filename
                        ? <Loader2 className="h-4 w-4 animate-spin text-danger" />
                        : <Trash2 className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Recent changes */}
        {isAdmin && recentAudit && recentAudit.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-text">Recent Changes</h2>
              <Link to="/audit" className="text-sm text-primary hover:underline">View all</Link>
            </div>
            <div className="border border-border rounded-lg bg-surface divide-y divide-border">
              {recentAudit.map(entry => (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Badge variant={
                    entry.action === 'DELETE' || entry.action === 'BULK_DELETE' ? 'danger' :
                    entry.action === 'INSERT' ? 'success' :
                    entry.action === 'MOVE' ? 'info' : 'warning'
                  }>
                    {entry.action}
                  </Badge>
                  <span className="text-text-secondary">{entry.username}</span>
                  <span className="text-text truncate">{entry.description || `${entry.table_name} in ${entry.database_name}`}</span>
                  <span className="ml-auto text-xs text-text-muted whitespace-nowrap">
                    {formatDistanceToNow(new Date(entry.created_at + 'Z'), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => { setDeleteTarget(null); deleteMutation.reset(); }}
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget); }}
        title="Delete Database"
        description={`Are you sure you want to delete "${deleteTarget}"? The database file will be permanently removed. A backup will be created first.`}
        confirmLabel="Delete Database"
        isLoading={deleteMutation.isPending}
        error={deleteMutation.error ? (deleteMutation.error as Error).message : null}
      />
    </div>
  );
}
