import { useParams, Link } from 'react-router-dom';
import { useTable } from '../hooks/useTable';
import { useDatabaseDetail } from '../hooks/useDatabases';
import { useAuth } from '../hooks/useAuth';
import { DataGrid } from '../components/data/DataGrid';
import { ArrowLeft, Download } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Loading } from '../components/shared/Loading';
import { Badge } from '../components/ui/Badge';
import { getTableExportUrl } from '../api/databases';
import { canWriteDb } from '../utils';
import { useState } from 'react';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';

export function TableView() {
  const { dbName, tableName } = useParams<{ dbName: string; tableName: string }>();
  const { user } = useAuth();
  const { data: dbDetail } = useDatabaseDetail(dbName);
  const table = useTable(dbName, tableName);
  const [deleteRowid, setDeleteRowid] = useState<number | null>(null);

  const tableSchema = dbDetail?.tables.find(t => t.name === tableName);
  const hasWriteAccess = canWriteDb(user?.role, dbName!);

  if (table.isLoading) return <Loading />;
  if (table.error) return <div className="text-danger">Error: {(table.error as Error).message}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to={`/db/${dbName}`} className="p-1.5 rounded-md hover:bg-surface-hover text-text-muted">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-text">{tableName}</h1>
            {hasWriteAccess && <Badge variant="success">editable</Badge>}
          </div>
          <p className="text-sm text-text-secondary">{dbName}</p>
        </div>
        <div className="ml-auto">
          <a href={getTableExportUrl(dbName!, tableName!)} download>
            <Button variant="secondary" size="sm">
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </a>
        </div>
      </div>

      {tableSchema && table.data && (
        <DataGrid
          columns={tableSchema.columns}
          rows={table.data.data}
          total={table.data.total}
          page={table.page}
          totalPages={table.data.totalPages}
          sort={table.sort}
          order={table.order}
          filters={table.filters}
          canEdit={hasWriteAccess}
          onSort={table.toggleSort}
          onFilter={table.setFilter}
          onPageChange={table.setPage}
          onUpdate={async (rowid, changes) => {
            await table.updateRow({ rowid, changes });
          }}
          onDelete={(rowid) => { setDeleteRowid(rowid); return Promise.resolve(); }}
          onInsert={async (row) => {
            await table.insertRow(row);
          }}
        />
      )}

      <ConfirmDialog
        open={deleteRowid !== null}
        onClose={() => setDeleteRowid(null)}
        onConfirm={async () => {
          if (deleteRowid !== null) {
            await table.deleteRow(deleteRowid);
            setDeleteRowid(null);
          }
        }}
        title="Delete Row"
        description="Are you sure you want to delete this row? This action cannot be undone."
        confirmLabel="Delete"
        isLoading={table.isDeleting}
      />
    </div>
  );
}
