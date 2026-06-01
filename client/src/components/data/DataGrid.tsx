import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { Trash2, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';
import { Select } from '../ui/Select';
import type { ColumnInfo } from '../../types';

export interface FilterModel {
  items: { field: string; value: string }[];
  quickFilterValues?: string[];
}

interface DataGridProps {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
  loading?: boolean;
  canEdit?: boolean;
  filterModel?: FilterModel;
  onSort: (column: string) => void;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  onFilterModelChange?: (model: FilterModel) => void;
  onUpdate?: (rowid: number, changes: Record<string, unknown>) => Promise<void>;
  onDelete?: (rowid: number) => Promise<void>;
}

function EditableCell({
  value: initialValue,
  rowId,
  columnName,
  columnType,
  onUpdate,
}: {
  value: unknown;
  rowId: number;
  columnName: string;
  columnType: string;
  onUpdate?: (rowid: number, changes: Record<string, unknown>) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(String(initialValue ?? ''));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(String(initialValue ?? ''));
  }, [initialValue]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commit = async () => {
    if (!onUpdate) return;
    const original = String(initialValue ?? '');
    if (value === original) {
      setIsEditing(false);
      return;
    }
    setSaving(true);
    try {
      const upperType = columnType.toUpperCase();
      let parsed: unknown = value;
      if (upperType.includes('INT')) parsed = value === '' ? null : parseInt(value, 10);
      else if (upperType.includes('REAL') || upperType.includes('FLOAT') || upperType.includes('DOUBLE'))
        parsed = value === '' ? null : parseFloat(value);
      else if (value === '') parsed = null;

      await onUpdate(rowId, { [columnName]: parsed });
    } finally {
      setSaving(false);
      setIsEditing(false);
    }
  };

  if (!onUpdate) {
    return <span className="truncate block" title={String(initialValue ?? '')}>{String(initialValue ?? '')}</span>;
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setValue(String(initialValue ?? '')); setIsEditing(false); }
        }}
        disabled={saving}
        className="w-full px-1.5 py-0.5 text-xs border border-primary rounded bg-surface focus:outline-none focus:ring-1 focus:ring-primary/30"
      />
    );
  }

  return (
    <span
      className="truncate block cursor-text hover:bg-surface-hover rounded px-1 -mx-1 transition-colors"
      onDoubleClick={() => setIsEditing(true)}
      title={`${String(initialValue ?? '')} (double-click to edit)`}
    >
      {String(initialValue ?? '')}
    </span>
  );
}

export function DataGrid({
  columns, rows, total, page, limit, loading, canEdit,
  filterModel, onSort, onPageChange, onLimitChange, onFilterModelChange,
  onUpdate, onDelete,
}: DataGridProps) {
  const [searchValue, setSearchValue] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync search value from external filterModel
  useEffect(() => {
    const externalSearch = (filterModel?.quickFilterValues ?? []).join(' ');
    setSearchValue(externalSearch);
  }, [filterModel?.quickFilterValues]);

  const handleSearchChange = useCallback((val: string) => {
    setSearchValue(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      onFilterModelChange?.({
        items: filterModel?.items ?? [],
        quickFilterValues: val ? val.split(/\s+/).filter(Boolean) : [],
      });
    }, 400);
  }, [filterModel?.items, onFilterModelChange]);

  const clearSearch = useCallback(() => {
    setSearchValue('');
    onFilterModelChange?.({ items: [], quickFilterValues: [] });
  }, [onFilterModelChange]);

  const tableColumns: ColumnDef<Record<string, unknown>>[] = useMemo(() => {
    const cols: ColumnDef<Record<string, unknown>>[] = columns
      .filter(c => c.name !== '_rowid')
      .map(col => ({
        id: col.name,
        accessorKey: col.name,
        header: col.name,
        size: 150,
        minSize: 80,
        cell: canEdit
          ? ({ getValue, row }) => (
              <EditableCell
                value={getValue()}
                rowId={row.original._rowid as number}
                columnName={col.name}
                columnType={col.type}
                onUpdate={onUpdate}
              />
            )
          : ({ getValue }) => (
              <span className="truncate block" title={String(getValue() ?? '')}>
                {String(getValue() ?? '')}
              </span>
            ),
      }));

    if (canEdit && onDelete) {
      cols.push({
        id: '_actions',
        header: '',
        size: 50,
        enableSorting: false,
        cell: ({ row }) => (
          <button
            onClick={() => onDelete(row.original._rowid as number)}
            className="p-1 rounded text-text-muted hover:text-danger hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            title="Delete row"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ),
      });
    }

    return cols;
  }, [columns, canEdit, onUpdate, onDelete]);

  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    manualFiltering: true,
    rowCount: total,
    state: { sorting },
    onSortingChange: updater => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      setSorting(next);
      if (next.length > 0) {
        onSort(next[0].id);
      } else {
        onSort('');
      }
    },
    getRowId: row => String(row._rowid),
  });

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface-dim">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
          <input
            value={searchValue}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search..."
            className="w-full pl-8 pr-7 py-1 text-xs border border-border rounded-md bg-surface
              focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-text-muted"
          />
          {searchValue && (
            <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-muted ml-auto">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <span>{total.toLocaleString()} rows</span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0 relative">
        {loading && rows.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-text-muted text-sm">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
          </div>
        )}
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="bg-surface-dim border-b border-border">
                {headerGroup.headers.map(header => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className={`px-3 py-2 text-left text-xs font-semibold text-text-secondary tracking-wide select-none
                        ${canSort ? 'cursor-pointer hover:text-text' : ''}`}
                      style={{ width: header.getSize() }}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && !sorted && <ArrowUpDown className="h-3 w-3 opacity-30" />}
                        {sorted === 'asc' && <ArrowUp className="h-3 w-3 text-primary" />}
                        {sorted === 'desc' && <ArrowDown className="h-3 w-3 text-primary" />}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr
                key={row.id}
                className="border-b border-border hover:bg-surface-hover odd:bg-surface-dim/40 transition-colors"
              >
                {row.getVisibleCells().map(cell => (
                  <td
                    key={cell.id}
                    className="px-3 py-1.5 text-xs max-w-[300px]"
                    style={{ width: cell.column.getSize() }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={tableColumns.length} className="px-3 py-12 text-center text-sm text-text-muted">
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-surface-dim text-xs text-text-secondary">
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <Select
            className="!py-0.5 text-xs w-18"
            value={limit}
            onChange={e => onLimitChange(parseInt(e.target.value, 10))}
            options={[
              { value: 25, label: '25' },
              { value: 50, label: '50' },
              { value: 100, label: '100' },
              { value: 200, label: '200' },
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <span>
            {((page - 1) * limit + 1).toLocaleString()}–{Math.min(page * limit, total).toLocaleString()} of {total.toLocaleString()}
          </span>
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="p-1 rounded hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span>{page}/{totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="p-1 rounded hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
