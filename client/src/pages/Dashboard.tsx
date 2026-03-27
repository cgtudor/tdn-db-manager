import { Link } from 'react-router-dom';
import { useDatabases } from '../hooks/useDatabases';
import { useAuth } from '../hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRecentAudit } from '../api/admin';
import { deleteDatabase } from '../api/databases';
import { Database, Swords, FlaskConical, HardDrive, Clock, ArrowRight, Trash2, Loader2 } from 'lucide-react';
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
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const { data: recentAudit } = useQuery({
    queryKey: ['recentAudit'],
    queryFn: () => getRecentAudit(10),
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (dbFilename: string) => deleteDatabase(dbFilename),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databases'] });
      setDeleteTarget(null);
    },
  });

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Dashboard</h1>
        <p className="text-sm text-text-secondary mt-1">Manage TDN game databases</p>
      </div>

      {/* Quick access */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          to="/loot"
          className="flex items-center gap-4 p-5 rounded-xl border border-border bg-surface hover:border-primary hover:shadow-md transition-all group"
        >
          <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-3 group-hover:bg-amber-200 dark:group-hover:bg-amber-900/50 transition-colors">
            <Swords className="h-6 w-6 text-amber-700 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-text">Loot Editor</h3>
            <p className="text-sm text-text-secondary">Manage tiered loot tables</p>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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

      {/* Recent audit */}
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
                <span className="text-text">{entry.description || `${entry.table_name} in ${entry.database_name}`}</span>
                <span className="ml-auto text-xs text-text-muted">
                  {formatDistanceToNow(new Date(entry.created_at + 'Z'), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
