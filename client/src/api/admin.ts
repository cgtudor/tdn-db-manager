import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type { AuditEntry, BackupEntry, AppUser } from '../types';

// Backups
export function getBackups(db?: string): Promise<BackupEntry[]> {
  return apiGet(db ? `/api/backups/${db}` : '/api/backups');
}

export function restoreBackup(db: string, timestamp: string): Promise<void> {
  return apiPost(`/api/backups/${db}/restore/${timestamp}`);
}

export function deleteBackup(db: string, timestamp: string): Promise<void> {
  return apiDelete(`/api/backups/${db}/${timestamp}`);
}

// Audit
export function getAuditLog(params?: {
  database?: string;
  user_id?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: AuditEntry[]; total: number }> {
  const sp = new URLSearchParams();
  if (params?.database) sp.set('database', params.database);
  if (params?.user_id) sp.set('user_id', params.user_id);
  if (params?.action) sp.set('action', params.action);
  if (params?.from) sp.set('from', params.from);
  if (params?.to) sp.set('to', params.to);
  if (params?.page) sp.set('page', String(params.page));
  if (params?.limit) sp.set('limit', String(params.limit));
  const qs = sp.toString();
  return apiGet(`/api/audit${qs ? `?${qs}` : ''}`);
}

export function getRecentAudit(limit = 10): Promise<AuditEntry[]> {
  return apiGet(`/api/audit/recent?limit=${limit}`);
}

// Users
export function getUsers(): Promise<AppUser[]> {
  return apiGet('/api/users');
}

export function setUserRole(discordId: string, role: string): Promise<void> {
  return apiPut(`/api/users/${discordId}/role`, { role });
}
