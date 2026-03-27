import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { AppUser, UserRole, AuditEntry } from '../types';

let db: Database.Database;

export function getAppDb(): Database.Database {
  if (!db) {
    const dbDir = config.appDataDir;
    fs.mkdirSync(dbDir, { recursive: true });

    const dbPath = path.join(dbDir, 'app.sqlite3');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    db.exec(schema);

    migrateAuditLogConstraint();
    seedDefaultConfig();
  }
  return db;
}

function migrateAuditLogConstraint(): void {
  // Check if the existing constraint needs updating by inspecting the table SQL
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='audit_log'").get() as { sql: string } | undefined;
  if (!tableInfo || tableInfo.sql.includes('DROP_TABLE')) return;

  // Recreate the table with the updated constraint
  db.exec(`
    ALTER TABLE audit_log RENAME TO audit_log_old;

    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_discord_id TEXT NOT NULL,
      username TEXT NOT NULL,
      database_name TEXT NOT NULL,
      table_name TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('INSERT', 'UPDATE', 'DELETE', 'BULK_DELETE', 'MOVE', 'RESTORE', 'DROP_TABLE', 'DELETE_DATABASE')),
      row_identifier TEXT,
      old_values TEXT,
      new_values TEXT,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO audit_log SELECT * FROM audit_log_old;
    DROP TABLE audit_log_old;

    CREATE INDEX IF NOT EXISTS idx_audit_log_database ON audit_log(database_name);
    CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_discord_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
  `);
}

function seedDefaultConfig(): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO database_config (db_filename, display_name, editor_access, description, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);

  const defaults: [string, string, string, string, number][] = [
    ['db_loot.sqlite3', 'Loot Tables', 'write', 'Tiered loot distribution tables', 1],
    ['db_crafting.sqlite3', 'Crafting Recipes', 'write', 'Recipes, ingredients, and professions', 2],
    ['db_encounters.sqlite3', 'Encounters', 'read', 'Area encounter configurations', 10],
    ['db_deity.sqlite3', 'Deities', 'read', 'Deity information and alignments', 11],
    ['db_systems.sqlite3', 'Systems', 'read', 'World state and game systems', 12],
    ['db_module.sqlite3', 'Module Content', 'read', 'Areas, creatures, items, placeables', 13],
    ['db_pc_stats.sqlite3', 'Player Stats', 'read', 'Player character statistics', 20],
    ['db_housing.sqlite3', 'Housing', 'read', 'Player housing data', 21],
    ['db_merchant_sys.sqlite3', 'Merchants', 'read', 'Store and merchant inventories', 22],
    ['db_metrics.sqlite3', 'Metrics', 'read', 'Game analytics and statistics', 30],
    ['db_pvp.sqlite3', 'PvP', 'read', 'PvP combat tracking', 31],
    ['db_pointofinterest.sqlite3', 'Points of Interest', 'read', 'POI tracking and progression', 32],
    ['db_rumormill.sqlite3', 'Rumor Mill', 'read', 'Bulletin board system', 33],
    ['tdn.sqlite3', 'TDN Core', 'read', 'Core persistent world data', 14],
    ['nui_form_data.sqlite3', 'NUI Forms', 'read', 'UI form definitions', 40],
    ['db_dreadnecro.sqlite3', 'Dread Necromancer', 'read', 'Dread Necro grave system', 41],
    ['placeables.sqlite3', 'Placeables', 'read', 'Persistent world placeables', 42],
  ];

  const insertMany = db.transaction(() => {
    for (const row of defaults) {
      insert.run(...row);
    }
  });
  insertMany();
}

// User operations
export function upsertUser(discordId: string, username: string, avatarUrl: string | null, role?: UserRole): AppUser {
  const appDb = getAppDb();

  const existing = appDb.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId) as AppUser | undefined;

  if (existing) {
    appDb.prepare(`
      UPDATE users SET username = ?, avatar_url = ?, last_login_at = datetime('now')
      WHERE discord_id = ?
    `).run(username, avatarUrl, discordId);
    return { ...existing, username, avatar_url: avatarUrl };
  }

  // New user - assign role
  const assignedRole = role || (config.adminDiscordIds.includes(discordId) ? 'admin' : 'viewer');

  appDb.prepare(`
    INSERT INTO users (discord_id, username, avatar_url, role, last_login_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(discordId, username, avatarUrl, assignedRole);

  return appDb.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId) as AppUser;
}

export function getUser(discordId: string): AppUser | undefined {
  return getAppDb().prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId) as AppUser | undefined;
}

export function getAllUsers(): AppUser[] {
  return getAppDb().prepare('SELECT * FROM users ORDER BY created_at').all() as AppUser[];
}

export function setUserRole(discordId: string, role: UserRole): void {
  getAppDb().prepare('UPDATE users SET role = ? WHERE discord_id = ?').run(role, discordId);
}

// Database config operations
export function getDbConfig(filename: string): { editor_access: string; display_name: string; description: string | null } | undefined {
  return getAppDb().prepare('SELECT editor_access, display_name, description FROM database_config WHERE db_filename = ?')
    .get(filename) as any;
}

export function getAllDbConfigs(): Record<string, { editor_access: string; display_name: string; description: string | null; sort_order: number }> {
  const rows = getAppDb().prepare('SELECT * FROM database_config ORDER BY sort_order').all() as any[];
  const map: Record<string, any> = {};
  for (const row of rows) {
    map[row.db_filename] = row;
  }
  return map;
}

// Audit operations
export function logAudit(
  userDiscordId: string,
  username: string,
  databaseName: string,
  tableName: string,
  action: string,
  rowIdentifier?: Record<string, unknown>,
  oldValues?: Record<string, unknown> | null,
  newValues?: Record<string, unknown> | null,
  description?: string
): void {
  getAppDb().prepare(`
    INSERT INTO audit_log (user_discord_id, username, database_name, table_name, action, row_identifier, old_values, new_values, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userDiscordId,
    username,
    databaseName,
    tableName,
    action,
    rowIdentifier ? JSON.stringify(rowIdentifier) : null,
    oldValues ? JSON.stringify(oldValues) : null,
    newValues ? JSON.stringify(newValues) : null,
    description || null
  );
}

export function getAuditLog(params: {
  database?: string;
  table?: string;
  userId?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): { data: AuditEntry[]; total: number } {
  const conditions: string[] = [];
  const values: any[] = [];

  if (params.database) { conditions.push('database_name = ?'); values.push(params.database); }
  if (params.table) { conditions.push('table_name = ?'); values.push(params.table); }
  if (params.userId) { conditions.push('user_discord_id = ?'); values.push(params.userId); }
  if (params.action) { conditions.push('action = ?'); values.push(params.action); }
  if (params.from) { conditions.push('created_at >= ?'); values.push(params.from); }
  if (params.to) { conditions.push('created_at <= ?'); values.push(params.to); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const page = params.page || 1;
  const limit = Math.min(params.limit || 50, 200);
  const offset = (page - 1) * limit;

  const total = (getAppDb().prepare(`SELECT COUNT(*) as count FROM audit_log ${where}`).get(...values) as any).count;
  const data = getAppDb().prepare(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...values, limit, offset) as AuditEntry[];

  return { data, total };
}

export function getRecentAudit(limit: number = 10): AuditEntry[] {
  return getAppDb().prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?').all(limit) as AuditEntry[];
}
