import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { globalSearch } from '../services/search';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  try {
    const q = req.query.q as string;
    if (!q || q.length < 2) {
      res.json([]);
      return;
    }
    const databases = req.query.databases
      ? (req.query.databases as string).split(',')
      : undefined;

    res.json(globalSearch(q, databases));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
