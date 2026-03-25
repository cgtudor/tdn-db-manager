import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types';
import { canWriteDatabase } from '../utils/permissions';
import { p } from '../utils/params';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user!.role)) {
      res.status(403).json({ error: `Requires one of: ${roles.join(', ')}` });
      return;
    }
    next();
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

export function requireDbWrite(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const dbFilename = p(req.params.db);
  if (!dbFilename) {
    res.status(400).json({ error: 'Database name required' });
    return;
  }

  if (!canWriteDatabase(req.user!.role, dbFilename)) {
    res.status(403).json({ error: `No write access to ${dbFilename}` });
    return;
  }

  next();
}
