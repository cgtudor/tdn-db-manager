import { getManagedDb } from '../db/managed-db';
import { ensureBackup } from './backup';
import { logAudit } from '../db/app-db';
import { LootItem, LootCategory } from '../types';

const DB_FILE = 'db_loot.sqlite3';

const CATEGORIES = ['weapon', 'armor', 'clothing', 'jewlery', 'misc', 'shield', 'ammo'] as const;
const TIERS = ['a', 'b', 'c', 'd', 'e'] as const;

export type LootCategoryName = typeof CATEGORIES[number];
export type LootTierName = typeof TIERS[number];

function tableName(category: string, tier: string): string {
  return `${category}_${tier}`;
}

function validateCategory(cat: string): void {
  if (!(CATEGORIES as readonly string[]).includes(cat)) {
    throw new Error(`Invalid loot category: ${cat}. Valid: ${CATEGORIES.join(', ')}`);
  }
}

function validateTier(tier: string): void {
  if (!(TIERS as readonly string[]).includes(tier)) {
    throw new Error(`Invalid loot tier: ${tier}. Valid: ${TIERS.join(', ')}`);
  }
}

export function getCategories(): string[] {
  return [...CATEGORIES];
}

export function getTiers(): string[] {
  return [...TIERS];
}

export function getOverview(): LootCategory[] {
  const db = getManagedDb(DB_FILE);
  const results: LootCategory[] = [];

  for (const cat of CATEGORIES) {
    const tierCounts: Record<string, number> = {};
    const tiers: Record<string, LootItem[]> = {};

    for (const tier of TIERS) {
      const table = tableName(cat, tier);
      const count = (db.prepare(`SELECT COUNT(*) as count FROM "${table}"`).get() as { count: number }).count;
      tierCounts[tier] = count;
      tiers[tier] = [];
    }

    results.push({ name: cat, tierCounts, tiers });
  }

  return results;
}

export function getCategoryItems(category: string): Record<string, LootItem[]> {
  validateCategory(category);
  const db = getManagedDb(DB_FILE);
  const result: Record<string, LootItem[]> = {};

  for (const tier of TIERS) {
    const table = tableName(category, tier);
    result[tier] = db.prepare(`SELECT resref, name FROM "${table}" ORDER BY name`).all() as LootItem[];
  }

  return result;
}

export function getTierItems(category: string, tier: string): LootItem[] {
  validateCategory(category);
  validateTier(tier);
  const db = getManagedDb(DB_FILE);
  return db.prepare(`SELECT resref, name FROM "${tableName(category, tier)}" ORDER BY name`).all() as LootItem[];
}

export function addItem(category: string, tier: string, item: LootItem, user: Express.User): void {
  validateCategory(category);
  validateTier(tier);
  ensureBackup(DB_FILE);

  const db = getManagedDb(DB_FILE);
  const table = tableName(category, tier);

  db.prepare(`INSERT INTO "${table}" (resref, name) VALUES (?, ?)`).run(item.resref, item.name);

  logAudit(user.id, user.username, DB_FILE, table, 'INSERT', { resref: item.resref }, null, item as unknown as Record<string, unknown>);
}

export function removeItem(category: string, tier: string, resref: string, user: Express.User): void {
  validateCategory(category);
  validateTier(tier);
  ensureBackup(DB_FILE);

  const db = getManagedDb(DB_FILE);
  const table = tableName(category, tier);

  const old = db.prepare(`SELECT * FROM "${table}" WHERE resref = ?`).get(resref) as LootItem | undefined;
  if (!old) throw new Error(`Item not found: ${resref} in ${table}`);

  db.prepare(`DELETE FROM "${table}" WHERE resref = ?`).run(resref);

  logAudit(user.id, user.username, DB_FILE, table, 'DELETE', { resref }, old as unknown as Record<string, unknown>, null);
}

export function updateItem(category: string, tier: string, resref: string, newName: string, user: Express.User): void {
  validateCategory(category);
  validateTier(tier);
  ensureBackup(DB_FILE);

  const db = getManagedDb(DB_FILE);
  const table = tableName(category, tier);

  const old = db.prepare(`SELECT * FROM "${table}" WHERE resref = ?`).get(resref) as LootItem | undefined;
  if (!old) throw new Error(`Item not found: ${resref} in ${table}`);

  db.prepare(`UPDATE "${table}" SET name = ? WHERE resref = ?`).run(newName, resref);

  logAudit(user.id, user.username, DB_FILE, table, 'UPDATE', { resref }, old as unknown as Record<string, unknown>, { resref, name: newName });
}

export function moveItems(
  items: LootItem[],
  fromCategory: string,
  fromTier: string,
  toCategory: string,
  toTier: string,
  user: Express.User
): void {
  validateCategory(fromCategory);
  validateTier(fromTier);
  validateCategory(toCategory);
  validateTier(toTier);

  if (fromCategory === toCategory && fromTier === toTier) {
    throw new Error('Source and destination are the same');
  }

  ensureBackup(DB_FILE);

  const db = getManagedDb(DB_FILE);
  const fromTable = tableName(fromCategory, fromTier);
  const toTable = tableName(toCategory, toTier);

  const move = db.transaction(() => {
    for (const item of items) {
      db.prepare(`DELETE FROM "${fromTable}" WHERE resref = ?`).run(item.resref);
      db.prepare(`INSERT INTO "${toTable}" (resref, name) VALUES (?, ?)`).run(item.resref, item.name);
    }
  });

  move();

  logAudit(user.id, user.username, DB_FILE, `${fromTable} -> ${toTable}`, 'MOVE',
    { items: items.map(i => i.resref) }, { from: { category: fromCategory, tier: fromTier } },
    { to: { category: toCategory, tier: toTier } },
    `Moved ${items.length} items from ${fromTable} to ${toTable}`);
}

export function searchLoot(query: string): { category: string; tier: string; resref: string; name: string }[] {
  const db = getManagedDb(DB_FILE);
  const results: { category: string; tier: string; resref: string; name: string }[] = [];
  const searchTerm = `%${query}%`;

  for (const cat of CATEGORIES) {
    for (const tier of TIERS) {
      const table = tableName(cat, tier);
      const rows = db.prepare(
        `SELECT resref, name FROM "${table}" WHERE resref LIKE ? OR name LIKE ?`
      ).all(searchTerm, searchTerm) as LootItem[];

      for (const row of rows) {
        results.push({ category: cat, tier, ...row });
      }
    }
  }

  return results;
}
