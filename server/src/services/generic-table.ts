import { getManagedDb } from '../db/managed-db';
import { getTableSchema, validateTableExists, validateColumnsExist } from './db-introspection';
import { ensureBackup } from './backup';
import { logAudit } from '../db/app-db';
import { PaginatedResponse } from '../types';

interface QueryParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  filters?: Record<string, string>;
}

export function getRows(dbFilename: string, tableName: string, params: QueryParams): PaginatedResponse<Record<string, unknown>> {
  validateTableExists(dbFilename, tableName);
  const db = getManagedDb(dbFilename);
  const schema = getTableSchema(dbFilename, tableName);

  const page = params.page || 1;
  const limit = Math.min(params.limit || 50, 500);
  const offset = (page - 1) * limit;

  // Build WHERE clause from filters
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.filters) {
    for (const [col, val] of Object.entries(params.filters)) {
      if (schema.columns.some(c => c.name === col)) {
        conditions.push(`"${col}" LIKE ?`);
        values.push(`%${val}%`);
      }
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Validate sort column
  let orderClause = '';
  if (params.sort && schema.columns.some(c => c.name === params.sort)) {
    const dir = params.order === 'desc' ? 'DESC' : 'ASC';
    orderClause = `ORDER BY "${params.sort}" ${dir}`;
  }

  const countResult = db.prepare(`SELECT COUNT(*) as count FROM "${tableName}" ${where}`).get(...values) as { count: number };
  const total = countResult.count;

  const rows = db.prepare(
    `SELECT rowid as _rowid, * FROM "${tableName}" ${where} ${orderClause} LIMIT ? OFFSET ?`
  ).all(...values, limit, offset) as Record<string, unknown>[];

  return {
    data: rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export function getRow(dbFilename: string, tableName: string, rowid: number): Record<string, unknown> | undefined {
  validateTableExists(dbFilename, tableName);
  const db = getManagedDb(dbFilename);
  return db.prepare(`SELECT rowid as _rowid, * FROM "${tableName}" WHERE rowid = ?`).get(rowid) as Record<string, unknown> | undefined;
}

export function insertRow(
  dbFilename: string,
  tableName: string,
  data: Record<string, unknown>,
  user: Express.User
): { rowid: number } {
  validateTableExists(dbFilename, tableName);
  const columns = Object.keys(data);
  validateColumnsExist(dbFilename, tableName, columns);

  ensureBackup(dbFilename);

  const db = getManagedDb(dbFilename);
  const placeholders = columns.map(() => '?').join(', ');
  const colNames = columns.map(c => `"${c}"`).join(', ');
  const values = columns.map(c => data[c]);

  const result = db.prepare(
    `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`
  ).run(...values);

  logAudit(user.id, user.username, dbFilename, tableName, 'INSERT', { rowid: result.lastInsertRowid }, null, data);

  return { rowid: Number(result.lastInsertRowid) };
}

export function updateRow(
  dbFilename: string,
  tableName: string,
  rowid: number,
  changes: Record<string, unknown>,
  user: Express.User
): void {
  validateTableExists(dbFilename, tableName);
  const columns = Object.keys(changes);
  validateColumnsExist(dbFilename, tableName, columns);

  const db = getManagedDb(dbFilename);

  // Fetch old values
  const oldRow = db.prepare(`SELECT * FROM "${tableName}" WHERE rowid = ?`).get(rowid) as Record<string, unknown> | undefined;
  if (!oldRow) throw new Error(`Row not found: rowid ${rowid}`);

  ensureBackup(dbFilename);

  const setClauses = columns.map(c => `"${c}" = ?`).join(', ');
  const values = columns.map(c => changes[c]);

  db.prepare(`UPDATE "${tableName}" SET ${setClauses} WHERE rowid = ?`).run(...values, rowid);

  logAudit(user.id, user.username, dbFilename, tableName, 'UPDATE', { rowid }, oldRow, changes);
}

export function deleteRow(
  dbFilename: string,
  tableName: string,
  rowid: number,
  user: Express.User
): void {
  validateTableExists(dbFilename, tableName);
  const db = getManagedDb(dbFilename);

  const oldRow = db.prepare(`SELECT * FROM "${tableName}" WHERE rowid = ?`).get(rowid) as Record<string, unknown> | undefined;
  if (!oldRow) throw new Error(`Row not found: rowid ${rowid}`);

  ensureBackup(dbFilename);

  db.prepare(`DELETE FROM "${tableName}" WHERE rowid = ?`).run(rowid);

  logAudit(user.id, user.username, dbFilename, tableName, 'DELETE', { rowid }, oldRow, null);
}

export function deleteRows(
  dbFilename: string,
  tableName: string,
  rowids: number[],
  user: Express.User
): number {
  validateTableExists(dbFilename, tableName);
  if (rowids.length === 0) return 0;

  ensureBackup(dbFilename);

  const db = getManagedDb(dbFilename);
  const placeholders = rowids.map(() => '?').join(', ');

  const oldRows = db.prepare(
    `SELECT rowid as _rowid, * FROM "${tableName}" WHERE rowid IN (${placeholders})`
  ).all(...rowids) as Record<string, unknown>[];

  const result = db.prepare(
    `DELETE FROM "${tableName}" WHERE rowid IN (${placeholders})`
  ).run(...rowids);

  logAudit(user.id, user.username, dbFilename, tableName, 'BULK_DELETE',
    { rowids }, { rows: oldRows }, null, `Deleted ${result.changes} rows`);

  return result.changes;
}

export function exportTableCsv(dbFilename: string, tableName: string, filters?: Record<string, string>): string {
  validateTableExists(dbFilename, tableName);
  const schema = getTableSchema(dbFilename, tableName);
  const db = getManagedDb(dbFilename);

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters) {
    for (const [col, val] of Object.entries(filters)) {
      if (schema.columns.some(c => c.name === col)) {
        conditions.push(`"${col}" LIKE ?`);
        values.push(`%${val}%`);
      }
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM "${tableName}" ${where}`).all(...values) as Record<string, unknown>[];

  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0]);
  const csvRows = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',')
    ),
  ];

  return csvRows.join('\n');
}
