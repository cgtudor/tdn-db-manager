import { getManagedDb } from '../db/managed-db';
import { TableSchema, ColumnInfo } from '../types';
import { isHiddenTable } from '../utils/permissions';

interface PragmaTableInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

export function getTableNames(dbFilename: string, includeHidden = false): string[] {
  const db = getManagedDb(dbFilename);
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all() as { name: string }[];

  if (includeHidden) return tables.map(t => t.name);
  return tables.map(t => t.name).filter(name => !isHiddenTable(name));
}

export function getTableSchema(dbFilename: string, tableName: string): TableSchema {
  const db = getManagedDb(dbFilename);
  const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all() as PragmaTableInfo[];

  if (columns.length === 0) {
    throw new Error(`Table not found: ${tableName}`);
  }

  const primaryKey = columns.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => c.name);
  const rowCount = (db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get() as { count: number }).count;

  return {
    name: tableName,
    columns: columns.map(c => ({
      name: c.name,
      type: c.type || 'TEXT',
      notNull: c.notnull === 1,
      defaultValue: c.dflt_value,
      isPrimaryKey: c.pk > 0,
    })),
    primaryKey,
    rowCount,
  };
}

export function getAllTableSchemas(dbFilename: string): TableSchema[] {
  const tableNames = getTableNames(dbFilename);
  return tableNames.map(name => getTableSchema(dbFilename, name));
}

export function getTableCount(dbFilename: string): number {
  return getTableNames(dbFilename).length;
}

export function validateTableExists(dbFilename: string, tableName: string): void {
  const names = getTableNames(dbFilename, true);
  if (!names.includes(tableName)) {
    throw new Error(`Table not found: ${tableName}`);
  }
}

export function validateColumnsExist(dbFilename: string, tableName: string, columnNames: string[]): void {
  const schema = getTableSchema(dbFilename, tableName);
  const validColumns = new Set(schema.columns.map(c => c.name));
  for (const col of columnNames) {
    if (!validColumns.has(col)) {
      throw new Error(`Invalid column: ${col} in table ${tableName}`);
    }
  }
}
