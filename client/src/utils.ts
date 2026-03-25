import type { UserRole } from './types';

const WRITABLE_DBS = new Set(['db_loot.sqlite3', 'db_crafting.sqlite3']);

export function canWriteDb(role: UserRole | undefined, dbFilename: string): boolean {
  if (!role) return false;
  if (role === 'admin') return true;
  if (role === 'editor') return WRITABLE_DBS.has(dbFilename);
  return false;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function tierLabel(tier: string): string {
  return `Tier ${tier.toUpperCase()}`;
}

export function categoryLabel(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}
