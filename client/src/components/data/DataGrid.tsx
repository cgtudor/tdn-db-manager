import { useState, useCallback } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Pencil, Trash2, X, Check, Filter } from 'lucide-react';
import { Button } from '../ui/Button';
import type { ColumnInfo } from '../../types';

interface DataGridProps {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  totalPages: number;
  sort?: string;
  order?: 'asc' | 'desc';
  filters: Record<string, string>;
  canEdit?: boolean;
  onSort: (column: string) => void;
  onFilter: (column: string, value: string) => void;
  onPageChange: (page: number) => void;
  onUpdate?: (rowid: number, changes: Record<string, unknown>) => Promise<void>;
  onDelete?: (rowid: number) => Promise<void>;
  onInsert?: (row: Record<string, unknown>) => Promise<void>;
}

export function DataGrid({
  columns, rows, total, page, totalPages,
  sort, order, filters, canEdit,
  onSort, onFilter, onPageChange, onUpdate, onDelete, onInsert,
}: DataGridProps) {
  const [editingCell, setEditingCell] = useState<{ rowid: number; column: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [filterColumn, setFilterColumn] = useState<string | null>(null);
  const [filterInput, setFilterInput] = useState('');
  const [showAddRow, setShowAddRow] = useState(false);
  const [newRow, setNewRow] = useState<Record<string, string>>({});

  const visibleColumns = columns.filter(c => c.name !== '_rowid');

  const startEdit = useCallback((rowid: number, column: string, currentValue: unknown) => {
    setEditingCell({ rowid, column });
    setEditValue(currentValue === null ? '' : String(currentValue));
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingCell || !onUpdate) return;
    const value = editValue === '' ? null : editValue;
    await onUpdate(editingCell.rowid, { [editingCell.column]: value });
    setEditingCell(null);
  }, [editingCell, editValue, onUpdate]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  const handleAddRow = async () => {
    if (!onInsert) return;
    const row: Record<string, unknown> = {};
    for (const col of visibleColumns) {
      if (newRow[col.name]) row[col.name] = newRow[col.name];
    }
    await onInsert(row);
    setNewRow({});
    setShowAddRow(false);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      {canEdit && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setShowAddRow(!showAddRow)}>
            {showAddRow ? 'Cancel' : '+ Add Row'}
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="border border-border rounded-lg overflow-auto bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-dim">
              {visibleColumns.map(col => (
                <th key={col.name} className="text-left px-3 py-2 font-medium text-text-secondary whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <button onClick={() => onSort(col.name)} className="flex items-center gap-1 hover:text-text">
                      {col.name}
                      {sort === col.name ? (
                        order === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </button>
                    <button
                      onClick={() => { setFilterColumn(filterColumn === col.name ? null : col.name); setFilterInput(filters[col.name] || ''); }}
                      className={`p-0.5 rounded hover:bg-surface-hover ${filters[col.name] ? 'text-primary' : 'opacity-30 hover:opacity-100'}`}
                    >
                      <Filter className="h-3 w-3" />
                    </button>
                  </div>
                  {filterColumn === col.name && (
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        autoFocus
                        value={filterInput}
                        onChange={e => setFilterInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { onFilter(col.name, filterInput); setFilterColumn(null); }
                          if (e.key === 'Escape') setFilterColumn(null);
                        }}
                        className="w-full px-2 py-0.5 text-xs border border-border rounded bg-surface"
                        placeholder="Filter..."
                      />
                      <button onClick={() => { onFilter(col.name, filterInput); setFilterColumn(null); }} className="text-primary">
                        <Check className="h-3 w-3" />
                      </button>
                      {filters[col.name] && (
                        <button onClick={() => { onFilter(col.name, ''); setFilterColumn(null); }} className="text-danger">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </th>
              ))}
              {canEdit && <th className="w-20 px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {/* Add row form */}
            {showAddRow && (
              <tr className="border-b border-border bg-primary-light/30">
                {visibleColumns.map(col => (
                  <td key={col.name} className="px-3 py-1.5">
                    <input
                      value={newRow[col.name] || ''}
                      onChange={e => setNewRow(prev => ({ ...prev, [col.name]: e.target.value }))}
                      className="w-full px-2 py-0.5 text-xs border border-border rounded bg-surface"
                      placeholder={col.name}
                    />
                  </td>
                ))}
                <td className="px-3 py-1.5">
                  <div className="flex gap-1">
                    <button onClick={handleAddRow} className="text-success hover:text-green-700"><Check className="h-4 w-4" /></button>
                    <button onClick={() => { setShowAddRow(false); setNewRow({}); }} className="text-danger"><X className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            )}

            {rows.map((row, i) => {
              const rowid = row._rowid as number;
              return (
                <tr key={rowid ?? i} className="border-b border-border last:border-0 hover:bg-surface-hover/50">
                  {visibleColumns.map(col => {
                    const isEditing = editingCell?.rowid === rowid && editingCell?.column === col.name;
                    const value = row[col.name];

                    return (
                      <td key={col.name} className="px-3 py-1.5 max-w-xs">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveEdit();
                                if (e.key === 'Escape') cancelEdit();
                              }}
                              className="w-full px-2 py-0.5 text-xs border border-primary rounded bg-surface"
                            />
                            <button onClick={saveEdit} className="text-success"><Check className="h-3.5 w-3.5" /></button>
                            <button onClick={cancelEdit} className="text-danger"><X className="h-3.5 w-3.5" /></button>
                          </div>
                        ) : (
                          <span
                            className={`truncate block ${canEdit ? 'cursor-pointer hover:bg-primary-light/30 rounded px-1 -mx-1' : ''}`}
                            onClick={() => canEdit && startEdit(rowid, col.name, value)}
                            title={value === null ? 'NULL' : String(value)}
                          >
                            {value === null ? <span className="text-text-muted italic">NULL</span> : String(value)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  {canEdit && (
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1">
                        <button
                          onClick={() => startEdit(rowid, visibleColumns[0].name, row[visibleColumns[0].name])}
                          className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-primary"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => onDelete?.(rowid)}
                          className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-text-muted">No data</div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-text-secondary">
          <span>{total} rows total</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>Page {page} of {totalPages}</span>
            <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
