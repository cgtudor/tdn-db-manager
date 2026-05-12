import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTableRows, insertRow, updateRow, deleteRow, bulkDeleteRows } from '../api/databases';
import { useState, useRef, useCallback } from 'react';
import type { GridFilterModel } from '@mui/x-data-grid';

const EMPTY_FILTER_MODEL: GridFilterModel = { items: [] };

export function useTable(db: string | undefined, table: string | undefined) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sort, setSort] = useState<string | undefined>();
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');

  // Filter model (controlled, passed to DataGrid)
  const [filterModel, setFilterModel] = useState<GridFilterModel>(EMPTY_FILTER_MODEL);

  // Debounced filter values that actually drive the query
  const [committedFilters, setCommittedFilters] = useState<Record<string, string>>({});
  const [committedSearch, setCommittedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const query = useQuery({
    queryKey: ['table', db, table, page, limit, sort, order, committedFilters, committedSearch],
    queryFn: () => getTableRows(db!, table!, {
      page, limit, sort, order,
      filters: committedFilters,
      search: committedSearch || undefined,
    }),
    enabled: !!db && !!table,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['table', db, table] });
  };

  const insertMutation = useMutation({
    mutationFn: (row: Record<string, unknown>) => insertRow(db!, table!, row),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ rowid, changes }: { rowid: number; changes: Record<string, unknown> }) =>
      updateRow(db!, table!, rowid, changes),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (rowid: number) => deleteRow(db!, table!, rowid),
    onSuccess: invalidate,
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (rowids: number[]) => bulkDeleteRows(db!, table!, rowids),
    onSuccess: invalidate,
  });

  const toggleSort = (column: string) => {
    if (sort === column) {
      setOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(column);
      setOrder('asc');
    }
    setPage(1);
  };

  const handleFilterChange = useCallback((model: GridFilterModel) => {
    setFilterModel(model);

    // Debounce the actual query update
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const filters: Record<string, string> = {};
      for (const item of model.items) {
        if (item.field && item.value != null && item.value !== '') {
          filters[item.field] = String(item.value);
        }
      }
      const search = (model.quickFilterValues ?? []).filter(Boolean).join(' ');

      setCommittedFilters(filters);
      setCommittedSearch(search);
      setPage(1);
    }, 500);
  }, []);

  const clearFilters = useCallback(() => {
    clearTimeout(debounceRef.current);
    setFilterModel(EMPTY_FILTER_MODEL);
    setCommittedFilters({});
    setCommittedSearch('');
    setPage(1);
  }, []);

  const hasActiveFilters = committedSearch !== '' || Object.keys(committedFilters).length > 0;

  return {
    ...query,
    page, setPage,
    limit, setLimit,
    sort, order, toggleSort,
    filterModel, handleFilterChange, clearFilters, hasActiveFilters,
    insertRow: insertMutation.mutateAsync,
    updateRow: updateMutation.mutateAsync,
    deleteRow: deleteMutation.mutateAsync,
    bulkDelete: bulkDeleteMutation.mutateAsync,
    isInserting: insertMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
