import { Router, Request, Response } from 'express';
import { requireDM } from '../auth/middleware';
import * as redisService from '../services/redis';
import * as dmNotes from '../services/dm-notes';

const router = Router();

// ─── REST Endpoints (initial page load) ─────────────────────

router.get('/status', requireDM, async (_req: Request, res: Response) => {
  try {
    const status = await redisService.getServerStatus();
    // If we got here without throwing, Redis is reachable
    res.json({
      ...status,
      redisConnected: true,
    });
  } catch (error: any) {
    res.json({ playerCount: 0, lastHeartbeat: 0, redisConnected: false });
  }
});

router.get('/players', requireDM, async (_req: Request, res: Response) => {
  try {
    const players = await redisService.getOnlinePlayers();
    res.json(players);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/areas', requireDM, async (_req: Request, res: Response) => {
  try {
    const areas = await redisService.getAreaPopulations();
    res.json(areas);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/areas/:tag/players', requireDM, async (req: Request, res: Response) => {
  try {
    const players = await redisService.getAreaPlayers(req.params.tag as string);
    res.json(players);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/analytics/debug', requireDM, async (_req: Request, res: Response) => {
  try {
    const redis = redisService.getRedisClient();
    const nowDayIndex = Math.floor(Date.now() / 1000 / 86400);
    const todayKey = `tdn:area_visits:${nowDayIndex}`;
    const allTime = await redis.hlen('tdn:area_visits');
    const todayData = await redis.hgetall(todayKey);
    const keys = await redis.keys('tdn:area_visits:*');
    res.json({
      nowDayIndex,
      todayKey,
      allTimeEntries: allTime,
      todayEntries: Object.keys(todayData).length,
      todaySample: Object.entries(todayData).slice(0, 5),
      allVisitKeys: keys.sort(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/analytics/areas', requireDM, async (_req: Request, res: Response) => {
  try {
    const areas = await redisService.getAreaAnalytics();
    res.json(areas);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/analytics/daily', requireDM, async (req: Request, res: Response) => {
  try {
    const days = Math.min(parseInt((req.query.days as string) || '30', 10), 35);
    const history = await redisService.getAreaDailyHistory(days);
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── DM Notes ───────────────────────────────────────────────

router.get('/notes/:uuid', requireDM, (req: Request, res: Response) => {
  try {
    const notes = dmNotes.getNotesForPlayer(req.params.uuid as string);
    res.json(notes);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/notes/:uuid', requireDM, (req: Request, res: Response) => {
  try {
    const { note, characterName } = req.body;
    if (!note || note.trim().length === 0) {
      res.status(400).json({ error: 'Note text required' });
      return;
    }
    const created = dmNotes.addNote(
      req.params.uuid as string,
      characterName || 'Unknown',
      note.trim(),
      req.user!.id,
      req.user!.username
    );
    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/notes/:uuid/:noteId', requireDM, (req: Request, res: Response) => {
  try {
    const deleted = dmNotes.deleteNote(
      parseInt(req.params.noteId as string, 10),
      req.user!.id,
      req.user!.role === 'admin'
    );
    if (!deleted) {
      res.status(404).json({ error: 'Note not found or not authorized' });
      return;
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/sessions/:uuid', requireDM, async (req: Request, res: Response) => {
  try {
    const data = await redisService.getPlayerSessions(req.params.uuid as string);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/charinfo/:uuid', requireDM, async (req: Request, res: Response) => {
  try {
    const info = await redisService.getCharacterInfo(req.params.uuid as string);
    if (!info) {
      res.status(404).json({ error: 'Character not found' });
      return;
    }
    res.json(info);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/chat/history', requireDM, async (req: Request, res: Response) => {
  try {
    const area = (req.query.area as string) || '_all';
    const count = parseInt((req.query.count as string) || '50', 10);
    const messages = await redisService.getChatHistory(area, Math.min(count, 200));
    res.json(messages);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/chat/search', requireDM, async (req: Request, res: Response) => {
  try {
    const area = (req.query.area as string) || '_all';
    const query = req.query.q as string;
    const count = parseInt((req.query.count as string) || '100', 10);
    if (!query || query.length < 2) {
      res.status(400).json({ error: 'Search query must be at least 2 characters' });
      return;
    }
    const messages = await redisService.searchChat(area, query, Math.min(count, 200));
    res.json(messages);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/chat/before', requireDM, async (req: Request, res: Response) => {
  try {
    const area = (req.query.area as string) || '_all';
    const beforeId = req.query.before as string;
    const count = parseInt((req.query.count as string) || '50', 10);
    if (!beforeId) {
      res.status(400).json({ error: 'before parameter required' });
      return;
    }
    const messages = await redisService.getChatHistoryBefore(area, beforeId, Math.min(count, 200));
    res.json(messages);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/feed/history', requireDM, async (req: Request, res: Response) => {
  try {
    const count = parseInt((req.query.count as string) || '50', 10);
    const events = await redisService.getActivityHistory(Math.min(count, 200));
    res.json(events);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── SSE Streams (live updates) ─────────────────────────────

router.get('/stream/chat', requireDM, async (req: Request, res: Response) => {
  const area = (req.query.area as string) || '_all';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(': connected\n\n');

  // Each SSE connection gets a dedicated Redis client for blocking reads
  const blockingClient = redisService.createBlockingClient();

  let lastId = '$';
  let alive = true;

  req.on('close', () => {
    alive = false;
    blockingClient.disconnect();
  });

  while (alive) {
    try {
      const { messages, lastId: newId } = await redisService.readChatStream(area, lastId, blockingClient, 5000);
      lastId = newId;

      for (const msg of messages) {
        if (!alive) break;
        res.write(`data: ${JSON.stringify(msg)}\n\n`);
      }
    } catch (err) {
      if (!alive) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
});

router.get('/stream/feed', requireDM, async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(': connected\n\n');

  const blockingClient = redisService.createBlockingClient();

  let lastId = '$';
  let alive = true;

  req.on('close', () => {
    alive = false;
    blockingClient.disconnect();
  });

  while (alive) {
    try {
      const { events, lastId: newId } = await redisService.readActivityFeed(lastId, blockingClient, 5000);
      lastId = newId;

      for (const evt of events) {
        if (!alive) break;
        res.write(`data: ${JSON.stringify(evt)}\n\n`);
      }
    } catch (err) {
      if (!alive) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
});

router.get('/stream/players', requireDM, async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(': connected\n\n');

  let alive = true;

  req.on('close', () => {
    alive = false;
  });

  // Poll player/area data every 3 seconds and send updates
  while (alive) {
    try {
      const [players, areas, rawStatus] = await Promise.all([
        redisService.getOnlinePlayers(),
        redisService.getAreaPopulations(),
        redisService.getServerStatus(),
      ]);
      const status = { ...rawStatus, redisConnected: true };

      if (!alive) break;

      res.write(`data: ${JSON.stringify({ players, areas, status })}\n\n`);
    } catch (err) {
      // Continue on error
    }

    // Wait 3 seconds before next poll
    await new Promise((r) => setTimeout(r, 3000));
  }
});

export default router;
