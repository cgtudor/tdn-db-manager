import { getManagedDb } from '../db/managed-db';

const MODULE_DB = 'db_module.sqlite3';

function getDb() {
  return getManagedDb(MODULE_DB);
}

export interface StoreListItem {
  id: number;
  tag: string;
  resref: string;
  name: string;
  area_name: string;
  area_resref: string;
  markup: number;
  markdown: number;
  store_gold: number;
  item_count: number;
}

export interface StoreInventoryItem {
  category: string;
  resref: string;
  tag: string;
  name: string;
  base_item: number;
  infinite: boolean;
  calculated_cost: number;
  store_buy_price: number;
}

export interface StoreDetail {
  store: StoreListItem;
  items: StoreInventoryItem[];
}

export function getStores(params?: { search?: string; area?: string }): StoreListItem[] {
  const db = getDb();
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params?.search) {
    conditions.push('(s.LocalizedName LIKE ? OR s.Tag LIKE ?)');
    const term = `%${params.search}%`;
    values.push(term, term);
  }
  if (params?.area) {
    conditions.push('a.ResRef = ?');
    values.push(params.area);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return db.prepare(`
    SELECT s.id, s.Tag as tag, s.ResRef as resref, s.LocalizedName as name,
           a.Name as area_name, a.ResRef as area_resref,
           s.MarkUp as markup, s.MarkDown as markdown, s.StoreGold as store_gold,
           (SELECT COUNT(*) FROM area_store_inventory si WHERE si.store_id = s.id) as item_count
    FROM area_stores s
    JOIN areas a ON s.area_id = a.id
    ${where}
    ORDER BY a.Name, s.LocalizedName
  `).all(...values).map((row: any) => ({
    id: row.id,
    tag: row.tag ?? '',
    resref: row.resref ?? '',
    name: row.name ?? '',
    area_name: row.area_name ?? '',
    area_resref: row.area_resref ?? '',
    markup: row.markup ?? 100,
    markdown: row.markdown ?? 100,
    store_gold: row.store_gold ?? -1,
    item_count: row.item_count ?? 0,
  }));
}

export function getStoreDetail(storeId: number): StoreDetail | null {
  const db = getDb();

  const store = db.prepare(`
    SELECT s.id, s.Tag as tag, s.ResRef as resref, s.LocalizedName as name,
           a.Name as area_name, a.ResRef as area_resref,
           s.MarkUp as markup, s.MarkDown as markdown, s.StoreGold as store_gold,
           (SELECT COUNT(*) FROM area_store_inventory si WHERE si.store_id = s.id) as item_count
    FROM area_stores s
    JOIN areas a ON s.area_id = a.id
    WHERE s.id = ?
  `).get(storeId) as any;

  if (!store) return null;

  const markup = store.markup ?? 100;

  const items = db.prepare(`
    SELECT Category as category, TemplateResRef as resref, Tag as tag,
           LocalizedName as name, BaseItem as base_item, Infinite as infinite,
           CalculatedCost as calculated_cost
    FROM area_store_inventory
    WHERE store_id = ?
    ORDER BY Category, LocalizedName
  `).all(storeId).map((row: any) => {
    const cost = row.calculated_cost ?? 0;
    return {
      category: row.category ?? '',
      resref: row.resref ?? '',
      tag: row.tag ?? '',
      name: row.name ?? '',
      base_item: row.base_item ?? 0,
      infinite: (row.infinite ?? 0) === 1,
      calculated_cost: cost,
      store_buy_price: Math.floor(cost * markup / 100),
    };
  });

  return {
    store: {
      id: store.id,
      tag: store.tag ?? '',
      resref: store.resref ?? '',
      name: store.name ?? '',
      area_name: store.area_name ?? '',
      area_resref: store.area_resref ?? '',
      markup,
      markdown: store.markdown ?? 100,
      store_gold: store.store_gold ?? -1,
      item_count: store.item_count ?? 0,
    },
    items,
  };
}

export function getAreas(): { resref: string; name: string }[] {
  const db = getDb();
  return db.prepare(`
    SELECT DISTINCT a.ResRef as resref, a.Name as name
    FROM areas a
    JOIN area_stores s ON s.area_id = a.id
    ORDER BY a.Name
  `).all() as any[];
}
