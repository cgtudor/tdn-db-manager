import { useQuery } from '@tanstack/react-query';
import { getDatabases, getDatabaseDetail } from '../api/databases';

export function useDatabases() {
  return useQuery({
    queryKey: ['databases'],
    queryFn: getDatabases,
    staleTime: 30_000,
  });
}

export function useDatabaseDetail(db: string | undefined) {
  return useQuery({
    queryKey: ['database', db],
    queryFn: () => getDatabaseDetail(db!),
    enabled: !!db,
    staleTime: 30_000,
  });
}
