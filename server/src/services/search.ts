import { getManagedDb, listDatabaseFiles } from '../db/managed-db';
import { getTableNames, getTableSchema } from './db-introspection';

interface SearchResult {
  database: string;
  table: string;
  column: string;
  value: string;
  rowid: number;
}

export function globalSearch(query: string, databases?: string[]): SearchResult[] {
  const results: SearchResult[] = [];
  const dbFiles = databases && databases.length > 0
    ? databases.filter(d => listDatabaseFiles().includes(d))
    : listDatabaseFiles();

  const searchTerm = `%${query}%`;
  const maxResults = 100;

  for (const dbFile of dbFiles) {
    if (results.length >= maxResults) break;

    try {
      const db = getManagedDb(dbFile);
      const tables = getTableNames(dbFile);

      for (const tableName of tables) {
        if (results.length >= maxResults) break;

        const schema = getTableSchema(dbFile, tableName);
        const textColumns = schema.columns.filter(c =>
          c.type.toUpperCase().includes('TEXT') || c.type.toUpperCase().includes('VARCHAR')
        );

        if (textColumns.length === 0) continue;

        const conditions = textColumns.map(c => `"${c.name}" LIKE ?`).join(' OR ');
        const values = textColumns.map(() => searchTerm);

        try {
          const rows = db.prepare(
            `SELECT rowid as _rowid, * FROM "${tableName}" WHERE ${conditions} LIMIT ?`
          ).all(...values, maxResults - results.length) as Record<string, unknown>[];

          for (const row of rows) {
            for (const col of textColumns) {
              const val = row[col.name];
              if (val && String(val).toLowerCase().includes(query.toLowerCase())) {
                results.push({
                  database: dbFile,
                  table: tableName,
                  column: col.name,
                  value: String(val),
                  rowid: row._rowid as number,
                });
                break; // One result per row
              }
            }
          }
        } catch {
          // Skip tables that can't be queried
        }
      }
    } catch {
      // Skip databases that can't be opened
    }
  }

  return results;
}
