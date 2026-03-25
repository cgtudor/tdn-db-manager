import { Router } from 'express';
import { requireAdmin } from '../auth/middleware';
import { p } from '../utils/params';
import { getAllUsers, setUserRole } from '../db/app-db';
import { UserRole } from '../types';

const router = Router();

router.get('/', requireAdmin, (_req, res) => {
  try {
    res.json(getAllUsers());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:discordId/role', requireAdmin, (req, res) => {
  try {
    const discordId = p(req.params.discordId);
    const { role } = req.body;

    if (!['admin', 'editor', 'viewer'].includes(role)) {
      res.status(400).json({ error: 'Invalid role. Must be admin, editor, or viewer' });
      return;
    }

    // Prevent removing own admin role
    if (discordId === req.user!.id && role !== 'admin') {
      res.status(400).json({ error: 'Cannot remove your own admin role' });
      return;
    }

    setUserRole(discordId, role as UserRole);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
