import { useParams, Link } from 'react-router-dom';
import { useDatabaseDetail } from '../hooks/useDatabases';
import { useAuth } from '../hooks/useAuth';
import { Database, Table, ArrowLeft } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Loading } from '../components/shared/Loading';
import { canWriteDb } from '../utils';

export function DatabaseExplorer() {
  const { dbName } = useParams<{ dbName: string }>();
  const { data, isLoading, error } = useDatabaseDetail(dbName);
  const { user } = useAuth();

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
          <Link
            key={table.name}
            to={`/db/${dbName}/${table.name}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors"
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
        ))}
      </div>
    </div>
  );
}
