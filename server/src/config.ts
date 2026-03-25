import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  baseUrl: process.env.BASE_URL || 'http://localhost:3001',

  discord: {
    clientId: required('DISCORD_CLIENT_ID'),
    clientSecret: required('DISCORD_CLIENT_SECRET'),
    callbackUrl: process.env.DISCORD_CALLBACK_URL || 'http://localhost:3001/auth/discord/callback',
  },

  sessionSecret: required('SESSION_SECRET'),

  databaseDir: process.env.DATABASE_DIR || path.resolve(__dirname, '../../../databases_backups'),
  appDataDir: process.env.APP_DATA_DIR || path.resolve(__dirname, '../data'),

  adminDiscordIds: (process.env.ADMIN_DISCORD_IDS || '').split(',').filter(Boolean),

  backup: {
    retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10),
    debounceSeconds: parseInt(process.env.BACKUP_DEBOUNCE_SECONDS || '60', 10),
  },
};
