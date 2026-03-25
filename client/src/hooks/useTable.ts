import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTableRows, insertRow, updateRow, deleteRow, bulkDeleteRows } from '../api/databases';
import { useState } from 'react';

export function useTable(db: string | undefined, table: string | undefined) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sort, setSort] = useState<string | undefined>();
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ['table', db, table, page, limit, sort, order, filters],
    queryFn: () => getTableRows(db!, table!, { page, limit, sort, order, filters }),
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

  const setFilter = (column: string, value: string) => {
    setFilters(prev => {
      const next = { ...prev };
      if (value) next[column] = value;
      else delete next[column];
      return next;
    });
    setPage(1);
  };

  return {
    ...query,
    page, setPage,
    limit, setLimit,
    sort, order, toggleSort,
    filters, setFilter,
    insertRow: insertMutation.mutateAsync,
    updateRow: updateMutation.mutateAsync,
    deleteRow: deleteMutation.mutateAsync,
    bulkDelete: bulkDeleteMutation.mutateAsync,
    isInserting: insertMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
