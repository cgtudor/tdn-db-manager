import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

const isLinux = process.platform === 'linux';
const connections = new Map<string, Database.Database>();

const DB_FILENAME_PATTERN = /^[\w.-]+\.sqlite3$/;

function validateDbName(filename: string): void {
  if (!DB_FILENAME_PATTERN.test(filename)) {
    throw new Error(`Invalid database filename: ${filename}`);
  }
}

export function getDbPath(filename: string): string {
  validateDbName(filename);
  return path.join(config.databaseDir, filename);
}

export function getManagedDb(filename: string): Database.Database {
  validateDbName(filename);

  let conn = connections.get(filename);
  if (conn) return conn;

  const dbPath = getDbPath(filename);
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database not found: ${filename}`);
  }

  conn = new Database(dbPath);
  conn.pragma('journal_mode = WAL');
  connections.set(filename, conn);

  // Ensure WAL sidecar files are accessible by the game server on Linux
  if (isLinux) {
    for (const suffix of ['', '-wal', '-shm']) {
      const p = dbPath + suffix;
      try { if (fs.existsSync(p)) fs.chmodSync(p, 0o777); } catch { /* best effort */ }
    }
  }

  return conn;
}

export function closeManagedDb(filename: string): void {
  const conn = connections.get(filename);
  if (conn) {
    conn.close();
    connections.delete(filename);
  }
}

export function reopenManagedDb(filename: string): Database.Database {
  closeManagedDb(filename);
  return getManagedDb(filename);
}

export function deleteDatabaseFile(filename: string): void {
  validateDbName(filename);

  // Close any open connection first
  closeManagedDb(filename);

  const dbPath = getDbPath(filename);
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database not found: ${filename}`);
  }

  // Delete the main file and WAL/SHM sidecars
  for (const suffix of ['', '-wal', '-shm']) {
    const filePath = dbPath + suffix;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

export function listDatabaseFiles(): string[] {
  if (!fs.existsSync(config.databaseDir)) {
    return [];
  }
  return fs.readdirSync(config.databaseDir)
    .filter(f => f.endsWith('.sqlite3'))
    .sort();
}

export function getDatabaseFileStats(filename: string): { sizeBytes: number; lastModified: string } {
  const dbPath = getDbPath(filename);
  const stats = fs.statSync(dbPath);
  return {
    sizeBytes: stats.size,
    lastModified: stats.mtime.toISOString(),
  };
}
