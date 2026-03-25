import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import passport from 'passport';
import path from 'path';
import { config } from './config';
import { createSessionMiddleware } from './auth/session';
import { setupPassport } from './auth/passport';
import authRoutes from './routes/auth';
import databaseRoutes from './routes/databases';
import tableRoutes from './routes/tables';
import lootRoutes from './routes/loot';
import craftingRoutes from './routes/crafting';
import searchRoutes from './routes/search';
import backupRoutes from './routes/backups';
import auditRoutes from './routes/audit';
import userRoutes from './routes/users';

export function createApp() {
  const app = express();
  const isHttps = config.baseUrl.startsWith('https');

  // Security
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'cdn.discordapp.com', 'data:'],
        upgradeInsecureRequests: isHttps ? [] : null,
      },
    },
    hsts: isHttps,
  }));

  app.use(cors({
    origin: config.baseUrl,
    credentials: true,
  }));

  // Rate limiting
  app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  // Body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Session & Passport
  app.use(createSessionMiddleware());
  app.use(passport.initialize());
  app.use(passport.session());
  setupPassport();

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Routes
  app.use('/auth', authRoutes);
  app.use('/api/databases', databaseRoutes);
  app.use('/api/databases', tableRoutes);
  app.use('/api/loot', lootRoutes);
  app.use('/api/crafting', craftingRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/backups', backupRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/users', userRoutes);

  // Serve static frontend in production
  const staticPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(staticPath));

  // SPA fallback
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/auth')) {
      return next();
    }
    res.sendFile(path.join(staticPath, 'index.html'), (err) => {
      if (err) {
        res.status(200).send(`
          <html>
            <head><title>TDN Database Manager</title></head>
            <body style="font-family: sans-serif; padding: 40px; text-align: center;">
              <h1>TDN Database Manager</h1>
              <p>Frontend not built yet. Run <code>npm run build:client</code></p>
              <p>API available at <code>/api/</code></p>
              <p><a href="/auth/discord">Login with Discord</a></p>
            </body>
          </html>
        `);
      }
    });
  });

  // Error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(err.status || 500).json({
      error: config.nodeEnv === 'production' ? 'Internal server error' : err.message,
    });
  });

  return app;
}
