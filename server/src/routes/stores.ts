import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import * as storesService from '../services/stores';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  try {
    res.json(storesService.getStores({
      search: req.query.search as string | undefined,
      area: req.query.area as string | undefined,
    }));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/areas', requireAuth, (_req, res) => {
  try {
    res.json(storesService.getAreas());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', requireAuth, (req, res) => {
  try {
    const detail = storesService.getStoreDetail(parseInt(req.params.id as string, 10));
    if (!detail) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }
    res.json(detail);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
