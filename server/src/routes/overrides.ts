import { Router, Request, Response, RequestHandler } from 'express';
import fs from 'fs';
import multer from 'multer';
import { p } from '../utils/params';
import * as overridesService from '../services/overrides';
import { logAudit } from '../db/app-db';

// In-memory upload; files are written through the path-safety helper.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB per file
});

interface OverridesOptions {
  /** Resolves the target directory at request time (env-backed config). */
  getDir: () => string;
  /** Auth/role guard applied to every endpoint. */
  guard: RequestHandler;
  /** Audit log "database name" used to tag uploads/deletes for this folder. */
  auditName: string;
}

export function createOverridesRouter({ getDir, guard, auditName }: OverridesOptions): Router {
  const router = Router();

  router.get('/', guard, (_req: Request, res: Response) => {
    try {
      res.json(overridesService.listFiles(getDir()));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/', guard, upload.array('files'), (req: Request, res: Response) => {
    try {
      const dir = getDir();
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        res.status(400).json({ error: 'No files uploaded' });
        return;
      }

      for (const file of files) {
        overridesService.writeFile(dir, file.originalname, file.buffer);
        logAudit(req.user!.id, req.user!.username, auditName, '*', 'UPLOAD',
          { name: file.originalname }, null, null, `Uploaded override: ${file.originalname}`);
      }

      res.json(overridesService.listFiles(dir));
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/:name', guard, (req: Request, res: Response) => {
    try {
      const name = p(req.params.name);
      overridesService.deleteFile(getDir(), name);
      logAudit(req.user!.id, req.user!.username, auditName, '*', 'DELETE',
        { name }, null, null, `Deleted override: ${name}`);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ─── SSE: real-time file list via fs.watch ──────────────────
  router.get('/stream', guard, (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write(': connected\n\n');

    const dir = getDir();
    const send = () => {
      try {
        res.write(`data: ${JSON.stringify(overridesService.listFiles(dir))}\n\n`);
      } catch { /* socket likely closed */ }
    };

    // Initial snapshot.
    send();

    // Debounce rapid fs events (a single upload can fire several).
    let debounce: NodeJS.Timeout | null = null;
    const onChange = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(send, 200);
    };

    let watcher: fs.FSWatcher | null = null;
    try {
      watcher = fs.watch(dir, onChange);
    } catch { /* directory may be unavailable; client still has the snapshot */ }

    // Heartbeat keeps proxies from closing an idle connection.
    const heartbeat = setInterval(() => {
      try { res.write(': ping\n\n'); } catch { /* closed */ }
    }, 30000);

    req.on('close', () => {
      if (debounce) clearTimeout(debounce);
      clearInterval(heartbeat);
      watcher?.close();
    });
  });

  return router;
}
