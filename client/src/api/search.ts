import { apiGet } from './client';
import type { SearchResult } from '../types';

export function globalSearch(query: string, databases?: string[]): Promise<SearchResult[]> {
  const sp = new URLSearchParams({ q: query });
  if (databases?.length) sp.set('databases', databases.join(','));
  return apiGet(`/api/search?${sp}`);
}
