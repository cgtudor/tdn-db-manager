import { apiGet } from './client';
import type { DatabaseInfo, DatabaseDetail, PaginatedResponse } from '../types';

export function getDatabases(): Promise<DatabaseInfo[]> {
  return apiGet<DatabaseInfo[]>('/api/databases');
}

export function getDatabaseDetail(db: string): Promise<DatabaseDetail> {
  return apiGet<DatabaseDetail>(`/api/databases/${db}`);
}

export function getTableRows(
  db: string,
  table: string,
  params?: { page?: number; limit?: number; sort?: string; order?: string; filters?: Record<string, string> }
): Promise<PaginatedResponse<Record<string, unknown>>> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.sort) searchParams.set('sort', params.sort);
  if (params?.order) searchParams.set('order', params.order);
  if (params?.filters) {
    for (const [col, val] of Object.entries(params.filters)) {
      searchParams.set(`filter[${col}]`, val);
    }
  }
  const qs = searchParams.toString();
  return apiGet(`/api/databases/${db}/tables/${table}${qs ? `?${qs}` : ''}`);
}

export function insertRow(db: string, table: string, row: Record<string, unknown>): Promise<{ rowid: number }> {
  return fetch(`/api/databases/${db}/tables/${table}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ row }),
  }).then(r => r.json());
}

export function updateRow(db: string, table: string, rowid: number, changes: Record<string, unknown>): Promise<void> {
  return fetch(`/api/databases/${db}/tables/${table}/${rowid}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changes }),
  }).then(r => { if (!r.ok) throw new Error('Update failed'); });
}

export function deleteRow(db: string, table: string, rowid: number): Promise<void> {
  return fetch(`/api/databases/${db}/tables/${table}/${rowid}`, {
    method: 'DELETE',
    credentials: 'include',
  }).then(r => { if (!r.ok) throw new Error('Delete failed'); });
}

export function bulkDeleteRows(db: string, table: string, rowids: number[]): Promise<{ deleted: number }> {
  return fetch(`/api/databases/${db}/tables/${table}/bulk-delete`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rowids }),
  }).then(r => r.json());
}

export function getTableExportUrl(db: string, table: string): string {
  return `/api/databases/${db}/tables/${table}/export`;
}
