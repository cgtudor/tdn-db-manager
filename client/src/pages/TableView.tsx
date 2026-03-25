import { useParams, Link } from 'react-router-dom';
import { useTable } from '../hooks/useTable';
import { useDatabaseDetail } from '../hooks/useDatabases';
import { useAuth } from '../hooks/useAuth';
import { DataGrid } from '../components/data/DataGrid';
import { ArrowLeft, Download, Plus } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Loading } from '../components/shared/Loading';
import { Badge } from '../components/ui/Badge';
import { getTableExportUrl } from '../api/databases';
import { canWriteDb } from '../utils';
import { useState, useRef, useEffect } from 'react';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import type { ColumnInfo } from '../types';

function AddRowDialog({ open, onClose, onSubmit, columns, isLoading }: {
  open: boolean;
  onClose: () => void;
  onSubmit: (row: Record<string, unknown>) => Promise<void>;
  columns: ColumnInfo[];
  isLoading: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setValues({});
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const editableColumns = columns.filter(c => c.name !== '_rowid');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const row: Record<string, unknown> = {};
    for (const col of editableColumns) {
      const val = values[col.name];
      if (val !== undefined && val !== '') {
        if (col.type.toUpperCase().includes('INT')) {
          row[col.name] = parseInt(val, 10);
        } else if (col.type.toUpperCase().includes('REAL')) {
          row[col.name] = parseFloat(val);
        } else {
          row[col.name] = val;
        }
      }
    }
    await onSubmit(row);
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="rounded-lg shadow-xl border border-border bg-surface text-text p-0 backdrop:bg-black/50 w-full max-w-lg max-h-[80vh]"
    >
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-base font-semibold">Add Row</h3>
        </div>
        <div className="px-6 py-4 space-y-3 overflow-y-auto max-h-[60vh]">
          {editableColumns.map(col => (
            <div key={col.name} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-secondary flex items-center gap-2">
                {col.name}
                <span className="text-text-muted font-normal">{col.type}</span>
                {col.notNull && <span className="text-danger text-[10px]">required</span>}
                {col.isPrimaryKey && <Badge variant="info">PK</Badge>}
              </label>
              <input
                type={col.type.toUpperCase().includes('INT') || col.type.toUpperCase().includes('REAL') ? 'number' : 'text'}
                value={values[col.name] || ''}
                onChange={e => setValues(prev => ({ ...prev, [col.name]: e.target.value }))}
                placeholder={col.defaultValue ? `Default: ${col.defaultValue}` : ''}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm
                  placeholder:text-text-muted
                  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          ))}
        </div>
        <div className="px-6 py-3 border-t border-border flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isLoading}>
            {isLoading ? 'Adding...' : 'Add Row'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

export function TableView() {
  const { dbName, tableName } = useParams<{ dbName: string; tableName: string }>();
  const { user } = useAuth();
  const { data: dbDetail } = useDatabaseDetail(dbName);
  const table = useTable(dbName, tableName);
  const [deleteRowid, setDeleteRowid] = useState<number | null>(null);
  const [showAddRow, setShowAddRow] = useState(false);

  const tableSchema = dbDetail?.tables.find(t => t.name === tableName);
  const hasWriteAccess = canWriteDb(user?.role, dbName!);

  if (table.isLoading) return <Loading />;
  if (table.error) return <div className="text-danger">Error: {(table.error as Error).message}</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 flex-shrink-0">
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
        <div className="ml-auto flex items-center gap-2">
          {table.data && (
            <span className="text-sm text-text-muted">{table.data.total.toLocaleString()} rows</span>
          )}
          {hasWriteAccess && (
            <Button variant="primary" size="sm" onClick={() => setShowAddRow(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add Row
            </Button>
          )}
          <a href={getTableExportUrl(dbName!, tableName!)} download>
            <Button variant="secondary" size="sm">
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </a>
        </div>
      </div>

      {/* DataGrid fills remaining space */}
      {tableSchema && table.data && (
        <div className="flex-1 min-h-0 border border-border rounded-lg overflow-hidden bg-surface">
          <DataGrid
            columns={tableSchema.columns}
            rows={table.data.data}
            total={table.data.total}
            page={table.page}
            limit={table.limit}
            canEdit={hasWriteAccess}
            onSort={table.toggleSort}
            onPageChange={table.setPage}
            onLimitChange={table.setLimit}
            onUpdate={async (rowid, changes) => {
              await table.updateRow({ rowid, changes });
            }}
            onDelete={(rowid) => { setDeleteRowid(rowid); return Promise.resolve(); }}
          />
        </div>
      )}

      {/* Add Row Dialog */}
      {tableSchema && (
        <AddRowDialog
          open={showAddRow}
          onClose={() => setShowAddRow(false)}
          columns={tableSchema.columns}
          isLoading={table.isInserting}
          onSubmit={async (row) => {
            await table.insertRow(row);
            setShowAddRow(false);
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
