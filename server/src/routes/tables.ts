import { Router } from 'express';
import { requireAuth, requireAdmin, requireDbWrite } from '../auth/middleware';
import { p } from '../utils/params';
import * as genericTable from '../services/generic-table';

const router = Router();

// Get paginated rows
router.get('/:db/tables/:table', requireAuth, (req, res) => {
  try {
    const db = p(req.params.db), table = p(req.params.table);
    const { page, limit, sort, order, ...rest } = req.query;

    // Extract filter params (filter[column]=value)
    const filters: Record<string, string> = {};
    for (const [key, val] of Object.entries(rest)) {
      const match = key.match(/^filter\[(\w+)\]$/);
      if (match && typeof val === 'string') {
        filters[match[1]] = val;
      }
    }

    const result = genericTable.getRows(db, table, {
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      sort: sort as string | undefined,
      order: order === 'desc' ? 'desc' : 'asc',
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Export table as CSV
router.get('/:db/tables/:table/export', requireAuth, (req, res) => {
  try {
    const db = p(req.params.db), table = p(req.params.table);
    const csv = genericTable.exportTableCsv(db, table);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${table}.csv"`);
    res.send(csv);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Insert row
router.post('/:db/tables/:table', requireDbWrite, (req, res) => {
  try {
    const db = p(req.params.db), table = p(req.params.table);
    const result = genericTable.insertRow(db, table, req.body.row || req.body, req.user!);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Update row
router.put('/:db/tables/:table/:rowid', requireDbWrite, (req, res) => {
  try {
    const db = p(req.params.db), table = p(req.params.table), rowid = p(req.params.rowid);
    genericTable.updateRow(db, table, parseInt(rowid, 10), req.body.changes || req.body, req.user!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Delete row
router.delete('/:db/tables/:table/:rowid', requireDbWrite, (req, res) => {
  try {
    const db = p(req.params.db), table = p(req.params.table), rowid = p(req.params.rowid);
    genericTable.deleteRow(db, table, parseInt(rowid, 10), req.user!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Drop table (admin only)
router.delete('/:db/tables/:table', requireAdmin, (req, res) => {
  try {
    const db = p(req.params.db), table = p(req.params.table);
    genericTable.dropTable(db, table, req.user!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Bulk delete
router.post('/:db/tables/:table/bulk-delete', requireDbWrite, (req, res) => {
  try {
    const db = p(req.params.db), table = p(req.params.table);
    const { rowids } = req.body;
    const deleted = genericTable.deleteRows(db, table, rowids, req.user!);
    res.json({ deleted });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
