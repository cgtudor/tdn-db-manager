import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBackups, restoreBackup, deleteBackup } from '../api/admin';
import { Loading } from '../components/shared/Loading';
import { EmptyState } from '../components/shared/EmptyState';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { Shield, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { formatBytes } from '../utils';

export function BackupManager() {
  const queryClient = useQueryClient();
  const { data: backups, isLoading } = useQuery({ queryKey: ['backups'], queryFn: () => getBackups() });
  const [restoreTarget, setRestoreTarget] = useState<{ db: string; timestamp: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ db: string; timestamp: string } | null>(null);

  const restoreMut = useMutation({
    mutationFn: (p: { db: string; timestamp: string }) => restoreBackup(p.db, p.timestamp),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['backups'] }); setRestoreTarget(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (p: { db: string; timestamp: string }) => deleteBackup(p.db, p.timestamp),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['backups'] }); setDeleteTarget(null); },
  });

  if (isLoading) return <Loading />;

  const grouped = backups?.reduce((acc, b) => {
    if (!acc[b.database]) acc[b.database] = [];
    acc[b.database].push(b);
    return acc;
  }, {} as Record<string, typeof backups>) ?? {};

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text">Backup Manager</h1>
      <p className="text-sm text-text-secondary">Backups are created automatically before database edits.</p>

      {backups?.length === 0 && <EmptyState icon={Shield} title="No backups yet" description="Backups will appear here after database edits" />}

      {Object.entries(grouped).map(([db, dbBackups]) => (
        <div key={db}>
          <h3 className="font-semibold text-sm text-text mb-2">{db} <Badge>{dbBackups!.length}</Badge></h3>
          <div className="border border-border rounded-lg bg-surface divide-y divide-border">
            {dbBackups!.map(backup => (
              <div key={backup.timestamp} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-sm text-text font-mono">{backup.timestamp.replace(/T/g, ' ').replace(/-/g, ':').slice(0, 19)}</span>
                <span className="text-xs text-text-muted">{formatBytes(backup.sizeBytes)}</span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setRestoreTarget({ db: backup.database, timestamp: backup.timestamp })}>
                    <RotateCcw className="h-3 w-3" /> Restore
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleteTarget({ db: backup.database, timestamp: backup.timestamp })}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <ConfirmDialog
        open={restoreTarget !== null}
        onClose={() => setRestoreTarget(null)}
        onConfirm={() => restoreTarget && restoreMut.mutate(restoreTarget)}
        title="Restore Backup"
        description="This will replace the current database with this backup. The current state will be backed up first."
        confirmLabel="Restore"
        variant="primary"
        isLoading={restoreMut.isPending}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget)}
        title="Delete Backup"
        description="Permanently delete this backup file?"
        confirmLabel="Delete"
        isLoading={deleteMut.isPending}
      />
    </div>
  );
}
