import { Router } from 'express';
import { requireAdmin } from '../auth/middleware';
import { p } from '../utils/params';
import * as backupService from '../services/backup';
import { reopenManagedDb } from '../db/managed-db';
import { logAudit } from '../db/app-db';

const router = Router();

router.get('/', requireAdmin, (_req, res) => {
  try {
    res.json(backupService.listBackups());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:db', requireAdmin, (req, res) => {
  try {
    res.json(backupService.listBackups(p(req.params.db)));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:db/restore/:timestamp', requireAdmin, (req, res) => {
  try {
    const db = p(req.params.db), timestamp = p(req.params.timestamp);
    backupService.restoreBackup(db, timestamp);
    reopenManagedDb(db);

    logAudit(req.user!.id, req.user!.username, db, '*', 'RESTORE',
      { timestamp }, null, null, `Restored from backup: ${timestamp}`);

    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:db/:timestamp', requireAdmin, (req, res) => {
  try {
    backupService.deleteBackup(p(req.params.db), p(req.params.timestamp));
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
