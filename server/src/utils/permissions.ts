import { UserRole } from '../types';
import { getDbConfig } from '../db/app-db';

export function canWriteDatabase(role: UserRole, dbFilename: string): boolean {
  if (role === 'admin') return true;
  if (role === 'viewer') return false;

  // Editor - check config
  const dbConfig = getDbConfig(dbFilename);
  if (dbConfig && dbConfig.editor_access === 'write') return true;

  return false;
}

export function canReadDatabase(role: UserRole, _dbFilename: string): boolean {
  // All authenticated users can read all databases
  return role === 'admin' || role === 'editor' || role === 'viewer';
}

// Tables that should be hidden from the UI (internal system tables)
const HIDDEN_TABLES = new Set(['db', 'meta', 'migrations']);

export function isHiddenTable(tableName: string): boolean {
  return HIDDEN_TABLES.has(tableName);
}
