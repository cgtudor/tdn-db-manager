import { UserRole } from './types';

// Extend Express User type - must be before any Express imports
declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      avatar: string | null;
      role: UserRole;
    }
  }
}

import { config } from './config';
import { createApp } from './app';
import { getAppDb } from './db/app-db';
import { cleanupOldBackups } from './services/backup';

// Initialize app database
getAppDb();

// Cleanup old backups on startup
try {
  const deleted = cleanupOldBackups();
  if (deleted > 0) {
    console.log(`Cleaned up ${deleted} old backup(s)`);
  }
} catch (err) {
  console.error('Failed to cleanup backups:', err);
}

const app = createApp();

app.listen(config.port, '0.0.0.0', () => {
  console.log(`TDN Database Manager running at ${config.baseUrl}`);
  console.log(`Database directory: ${config.databaseDir}`);
  console.log(`Environment: ${config.nodeEnv}`);
});
