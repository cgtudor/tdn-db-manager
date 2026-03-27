import { useParams, Link } from 'react-router-dom';
import { useDatabaseDetail } from '../hooks/useDatabases';
import { useAuth } from '../hooks/useAuth';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dropTable } from '../api/databases';
import { Database, Table, ArrowLeft, Trash2, Loader2 } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Loading } from '../components/shared/Loading';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { canWriteDb } from '../utils';
import { useState } from 'react';

export function DatabaseExplorer() {
  const { dbName } = useParams<{ dbName: string }>();
  const { data, isLoading, error } = useDatabaseDetail(dbName);
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const dropMutation = useMutation({
    mutationFn: (tableName: string) => dropTable(dbName!, tableName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['database', dbName] });
      queryClient.invalidateQueries({ queryKey: ['databases'] });
      setDropTarget(null);
    },
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <div className="text-danger">Database not found: {dbName}</div>;

  const hasWriteAccess = canWriteDb(user?.role, dbName!);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/" className="p-1.5 rounded-md hover:bg-surface-hover text-text-muted">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Database className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold text-text">{dbName}</h1>
        {hasWriteAccess && <Badge variant="success">editable</Badge>}
      </div>

      <div className="text-sm text-text-secondary">
        {data.tables.length} tables
      </div>

      <div className="border border-border rounded-lg bg-surface divide-y divide-border">
        {data.tables.map(table => (
          <div key={table.name} className="flex items-center hover:bg-surface-hover transition-colors">
            <Link
              to={`/db/${dbName}/${table.name}`}
              className="flex items-center gap-3 px-4 py-3 flex-1 min-w-0"
            >
              <Table className="h-4 w-4 text-text-muted flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm text-text">{table.name}</span>
                <div className="text-xs text-text-muted mt-0.5">
                  {table.columns.length} columns, {table.rowCount.toLocaleString()} rows
                  {table.primaryKey.length > 0 && (
                    <span className="ml-2">PK: {table.primaryKey.join(', ')}</span>
                  )}
                </div>
              </div>
              <span className="text-xs text-text-muted">{table.rowCount.toLocaleString()} rows</span>
            </Link>
            {isAdmin && (
              <button
                onClick={(e) => { e.preventDefault(); dropMutation.reset(); setDropTarget(table.name); }}
                className="p-2 mr-2 rounded-md text-text-muted hover:text-danger hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                title="Drop table"
                disabled={dropMutation.isPending && dropTarget === table.name}
              >
                {dropMutation.isPending && dropTarget === table.name
                  ? <Loader2 className="h-4 w-4 animate-spin text-danger" />
                  : <Trash2 className="h-4 w-4" />}
              </button>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={dropTarget !== null}
        onClose={() => { setDropTarget(null); dropMutation.reset(); }}
        onConfirm={() => { if (dropTarget) dropMutation.mutate(dropTarget); }}
        title="Drop Table"
        description={`Are you sure you want to drop the table "${dropTarget}"? All data will be permanently deleted. A backup will be created first.`}
        confirmLabel="Drop Table"
        isLoading={dropMutation.isPending}
        error={dropMutation.error ? (dropMutation.error as Error).message : null}
      />
    </div>
  );
}
