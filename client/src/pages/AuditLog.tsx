import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAuditLog } from '../api/admin';
import { Loading } from '../components/shared/Loading';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react';
import { EmptyState } from '../components/shared/EmptyState';
import { formatDistanceToNow } from 'date-fns';

export function AuditLog() {
  const [page, setPage] = useState(1);
  const [databaseFilter, setDatabaseFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['audit', page, databaseFilter, actionFilter],
    queryFn: () => getAuditLog({
      database: databaseFilter || undefined,
      action: actionFilter || undefined,
      page,
      limit: 50,
    }),
  });

  if (isLoading) return <Loading />;

  const totalPages = data ? Math.ceil(data.total / 50) : 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-text">Audit Log</h1>

      <div className="flex gap-2">
        <input
          value={databaseFilter}
          onChange={e => { setDatabaseFilter(e.target.value); setPage(1); }}
          placeholder="Filter by database..."
          className="px-3 py-1.5 text-sm border border-border rounded-md bg-surface"
        />
        <select
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setPage(1); }}
          className="px-3 py-1.5 text-sm border border-border rounded-md bg-surface"
        >
          <option value="">All actions</option>
          <option value="INSERT">INSERT</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
          <option value="BULK_DELETE">BULK_DELETE</option>
          <option value="MOVE">MOVE</option>
          <option value="RESTORE">RESTORE</option>
        </select>
      </div>

      {data?.data.length === 0 && <EmptyState icon={ClipboardList} title="No audit entries" />}

      {data && data.data.length > 0 && (
        <div className="border border-border rounded-lg bg-surface overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-dim border-b border-border">
                <th className="text-left px-3 py-2 font-medium text-text-secondary">Time</th>
                <th className="text-left px-3 py-2 font-medium text-text-secondary">User</th>
                <th className="text-left px-3 py-2 font-medium text-text-secondary">Action</th>
                <th className="text-left px-3 py-2 font-medium text-text-secondary">Database</th>
                <th className="text-left px-3 py-2 font-medium text-text-secondary">Table</th>
                <th className="text-left px-3 py-2 font-medium text-text-secondary">Description</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map(entry => (
                <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-surface-hover/50">
                  <td className="px-3 py-2 text-text-muted whitespace-nowrap" title={entry.created_at}>
                    {formatDistanceToNow(new Date(entry.created_at + 'Z'), { addSuffix: true })}
                  </td>
                  <td className="px-3 py-2">{entry.username}</td>
                  <td className="px-3 py-2">
                    <Badge variant={
                      entry.action === 'DELETE' || entry.action === 'BULK_DELETE' ? 'danger' :
                      entry.action === 'INSERT' ? 'success' :
                      entry.action === 'MOVE' ? 'info' : 'warning'
                    }>{entry.action}</Badge>
                  </td>
                  <td className="px-3 py-2 text-text-muted">{entry.database_name}</td>
                  <td className="px-3 py-2 text-text-muted">{entry.table_name}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={entry.description || ''}>
                    {entry.description || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-text-secondary">
          <span>{data?.total} entries</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>Page {page} of {totalPages}</span>
            <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
