import session from 'express-session';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

// connect-sqlite3 doesn't have TS types
const SQLiteStore = require('connect-sqlite3')(session);

export function createSessionMiddleware() {
  const dataDir = config.appDataDir;
  fs.mkdirSync(dataDir, { recursive: true });

  return session({
    store: new SQLiteStore({
      db: 'sessions.sqlite3',
      dir: dataDir,
      table: 'sessions',
    }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.baseUrl.startsWith('https'),
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax' as const,
    },
  });
}
