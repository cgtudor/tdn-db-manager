import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { getDbPath } from '../db/managed-db';

const isLinux = process.platform === 'linux';
const lastBackupTime = new Map<string, number>();

function chmodOpen(filePath: string): void {
  if (isLinux) {
    try { fs.chmodSync(filePath, 0o777); } catch { /* best effort */ }
  }
}

function getBackupDir(dbFilename: string): string {
  return path.join(config.appDataDir, 'backups', dbFilename);
}

export function ensureBackup(dbFilename: string): string | null {
  const now = Date.now();
  const lastTime = lastBackupTime.get(dbFilename) || 0;

  // Debounce: skip if backed up within the debounce window
  if (now - lastTime < config.backup.debounceSeconds * 1000) {
    return null;
  }

  const backupDir = getBackupDir(dbFilename);
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o777 });
  chmodOpen(backupDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `${timestamp}.sqlite3`);
  const sourcePath = getDbPath(dbFilename);

  fs.copyFileSync(sourcePath, backupPath);
  chmodOpen(backupPath);
  lastBackupTime.set(dbFilename, now);

  return backupPath;
}

export function listBackups(dbFilename?: string): { database: string; timestamp: string; sizeBytes: number; path: string }[] {
  const backupsRoot = path.join(config.appDataDir, 'backups');
  if (!fs.existsSync(backupsRoot)) return [];

  const databases = dbFilename ? [dbFilename] : fs.readdirSync(backupsRoot);
  const results: { database: string; timestamp: string; sizeBytes: number; path: string }[] = [];

  for (const db of databases) {
    const dir = path.join(backupsRoot, db);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sqlite3'));
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      results.push({
        database: db,
        timestamp: file.replace('.sqlite3', ''),
        sizeBytes: stats.size,
        path: filePath,
      });
    }
  }

  return results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function restoreBackup(dbFilename: string, timestamp: string): void {
  const backupDir = getBackupDir(dbFilename);
  const backupPath = path.join(backupDir, `${timestamp}.sqlite3`);

  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup not found: ${dbFilename}/${timestamp}`);
  }

  // Create a safety backup of current state before restoring
  const safetyDir = getBackupDir(dbFilename);
  fs.mkdirSync(safetyDir, { recursive: true, mode: 0o777 });
  chmodOpen(safetyDir);
  const safetyTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safetyPath = path.join(safetyDir, `pre-restore-${safetyTimestamp}.sqlite3`);
  const targetPath = getDbPath(dbFilename);

  fs.copyFileSync(targetPath, safetyPath);
  chmodOpen(safetyPath);
  fs.copyFileSync(backupPath, targetPath);
  chmodOpen(targetPath);
}

export function deleteBackup(dbFilename: string, timestamp: string): void {
  const backupPath = path.join(getBackupDir(dbFilename), `${timestamp}.sqlite3`);
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }
}

export function cleanupOldBackups(): number {
  const maxAge = config.backup.retentionDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let deleted = 0;

  const backupsRoot = path.join(config.appDataDir, 'backups');
  if (!fs.existsSync(backupsRoot)) return 0;

  for (const dbDir of fs.readdirSync(backupsRoot)) {
    const dir = path.join(backupsRoot, dbDir);
    if (!fs.statSync(dir).isDirectory()) continue;

    for (const file of fs.readdirSync(dir)) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        deleted++;
      }
    }
  }

  return deleted;
}
