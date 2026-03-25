import { Router } from 'express';
import { requireAdmin, requireAuth } from '../auth/middleware';
import { getAuditLog, getRecentAudit } from '../db/app-db';

const router = Router();

router.get('/', requireAdmin, (req, res) => {
  try {
    const result = getAuditLog({
      database: req.query.database as string | undefined,
      table: req.query.table as string | undefined,
      userId: req.query.user_id as string | undefined,
      action: req.query.action as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/recent', requireAuth, (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    res.json(getRecentAudit(limit));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
