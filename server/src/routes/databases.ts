import { Router } from 'express';
import { requireAuth, requireAdmin } from '../auth/middleware';
import { p } from '../utils/params';
import { listDatabaseFiles, getDatabaseFileStats, deleteDatabaseFile } from '../db/managed-db';
import { getTableCount, getAllTableSchemas, getTableNames } from '../services/db-introspection';
import { getAllDbConfigs, logAudit } from '../db/app-db';
import { DatabaseInfo } from '../types';
import { ensureBackup } from '../services/backup';

const router = Router();

// List all databases
router.get('/', requireAuth, (_req, res) => {
  try {
    const files = listDatabaseFiles();
    const configs = getAllDbConfigs();

    const databases: DatabaseInfo[] = files.map(filename => {
      const stats = getDatabaseFileStats(filename);
      const dbConfig = configs[filename];
      let tableCount = 0;
      try { tableCount = getTableCount(filename); } catch { /* skip */ }

      return {
        filename,
        displayName: dbConfig?.display_name || filename.replace('.sqlite3', '').replace(/^db_/, ''),
        sizeBytes: stats.sizeBytes,
        lastModified: stats.lastModified,
        tableCount,
        editorAccess: (dbConfig?.editor_access || 'read') as 'read' | 'write',
        description: dbConfig?.description || null,
      };
    });

    // Sort by config sort_order, then by name
    databases.sort((a, b) => {
      const aOrder = configs[a.filename]?.sort_order ?? 100;
      const bOrder = configs[b.filename]?.sort_order ?? 100;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.displayName.localeCompare(b.displayName);
    });

    res.json(databases);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single database info with table list
router.get('/:db', requireAuth, (req, res) => {
  try {
    const db = p(req.params.db);
    const stats = getDatabaseFileStats(db);
    const schemas = getAllTableSchemas(db);

    res.json({
      filename: db,
      ...stats,
      tables: schemas.map(s => ({
        name: s.name,
        columns: s.columns,
        primaryKey: s.primaryKey,
        rowCount: s.rowCount,
      })),
    });
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

// Delete database (admin only)
router.delete('/:db', requireAdmin, (req, res) => {
  try {
    const db = p(req.params.db);

    // Create a final backup before deletion
    ensureBackup(db);

    const stats = getDatabaseFileStats(db);
    let tableCount = 0;
    try { tableCount = getTableCount(db); } catch { /* skip */ }

    deleteDatabaseFile(db);

    logAudit(req.user!.id, req.user!.username, db, '*', 'DELETE_DATABASE', undefined, undefined, undefined,
      `Deleted database "${db}" (${tableCount} tables, ${stats.sizeBytes} bytes)`);

    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
