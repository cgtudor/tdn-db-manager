import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware';
import { p } from '../utils/params';
import * as lootService from '../services/loot';

const router = Router();

const requireEditor = requireRole('admin', 'editor');

router.get('/categories', requireAuth, (_req, res) => {
  res.json({ categories: lootService.getCategories(), tiers: lootService.getTiers() });
});

router.get('/overview', requireAuth, (_req, res) => {
  try {
    res.json(lootService.getOverview());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/search', requireAuth, (req, res) => {
  try {
    const q = req.query.q as string;
    if (!q || q.length < 2) {
      res.json([]);
      return;
    }
    res.json(lootService.searchLoot(q));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:category', requireAuth, (req, res) => {
  try {
    res.json(lootService.getCategoryItems(p(req.params.category)));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:category/:tier', requireAuth, (req, res) => {
  try {
    res.json(lootService.getTierItems(p(req.params.category), p(req.params.tier)));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:category/:tier', requireEditor, (req, res) => {
  try {
    const { resref, name } = req.body;
    lootService.addItem(p(req.params.category), p(req.params.tier), { resref, name }, req.user!);
    res.status(201).json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:category/:tier/:resref', requireEditor, (req, res) => {
  try {
    const { name } = req.body;
    lootService.updateItem(p(req.params.category), p(req.params.tier), p(req.params.resref), name, req.user!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:category/:tier/:resref', requireEditor, (req, res) => {
  try {
    lootService.removeItem(p(req.params.category), p(req.params.tier), p(req.params.resref), req.user!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/move', requireEditor, (req, res) => {
  try {
    const { items, from, to } = req.body;
    lootService.moveItems(items, from.category, from.tier, to.category, to.tier, req.user!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
