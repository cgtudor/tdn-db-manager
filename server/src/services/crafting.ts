import { getManagedDb } from '../db/managed-db';
import { ensureBackup } from './backup';
import { logAudit } from '../db/app-db';
import { Recipe, RecipeDetail, PaginatedResponse } from '../types';

const DB_FILE = 'db_crafting.sqlite3';
const LOOT_DB_FILE = 'db_loot.sqlite3';

// Secondary yield chance per tier, keyed by profession_id
// Mining (9), Woodcutting (8): same chances
// Skinning (10): lower chances
const SECONDARY_YIELD_CHANCES: Record<number, Record<number, number>> = {
  8: { 1: 10, 2: 25, 3: 40, 4: 60, 5: 80 },  // Woodcutting
  9: { 1: 10, 2: 25, 3: 40, 4: 60, 5: 80 },  // Mining
  10: { 1: 5, 2: 10, 3: 20, 4: 40, 5: 60 },   // Skinning
};

// Profession IDs that use secondary yield system
const SECONDARY_YIELD_PROF_IDS = [8, 9, 10];
// Professions that use <= tier pooling (include lower tiers in the drop pool)
const INCLUSIVE_TIER_PROF_IDS = new Set([9, 10]);  // Mining, Skinning
const SKINNING_PROF_ID = 10;
const MINING_PROF_ID = 9;
const HERBALISM_PROF_ID = 4;
const FISHING_PROF_ID = 6;

const LOOT_CATEGORIES = ['weapon', 'armor', 'clothing', 'jewlery', 'misc', 'shield', 'ammo', 'crafting', 'recipe'] as const;
const LOOT_TIERS = ['a', 'b', 'c', 'cplus', 'd', 'e'] as const;
const MODULE_DB_FILE = 'db_module.sqlite3';

export function getRecipes(params: {
  professionId?: number;
  typeId?: number;
  levelMin?: number;
  levelMax?: number;
  search?: string;
  page?: number;
  limit?: number;
}): PaginatedResponse<Recipe> {
  const db = getManagedDb(DB_FILE);
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.professionId) { conditions.push('r.profession_id = ?'); values.push(params.professionId); }
  if (params.typeId) { conditions.push('r.recipe_type_id = ?'); values.push(params.typeId); }
  if (params.levelMin) { conditions.push('r.recipe_crafting_level >= ?'); values.push(params.levelMin); }
  if (params.levelMax) { conditions.push('r.recipe_crafting_level <= ?'); values.push(params.levelMax); }
  if (params.search) {
    conditions.push('(r.recipe_name LIKE ? OR r.recipe_resref LIKE ? OR p.product_name LIKE ?)');
    const term = `%${params.search}%`;
    values.push(term, term, term);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const page = params.page || 1;
  const limit = Math.min(params.limit || 50, 200);
  const offset = (page - 1) * limit;

  const countSql = `
    SELECT COUNT(*) as count FROM recipes r
    LEFT JOIN products p ON r.product_id = p.product_id
    ${where}
  `;
  const total = (db.prepare(countSql).get(...values) as { count: number }).count;

  const dataSql = `
    SELECT r.recipe_id, r.recipe_name, r.recipe_resref, r.recipe_crafting_level,
           r.profession_id, r.recipe_type_id, r.product_id,
           prof.profession_name, rt.recipe_type_name
    FROM recipes r
    LEFT JOIN professions prof ON r.profession_id = prof.profession_id
    LEFT JOIN recipe_types rt ON r.recipe_type_id = rt.recipe_type_id
    LEFT JOIN products p ON r.product_id = p.product_id
    ${where}
    ORDER BY prof.profession_name, r.recipe_crafting_level, r.recipe_name
    LIMIT ? OFFSET ?
  `;

  const data = db.prepare(dataSql).all(...values, limit, offset) as Recipe[];

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export function getRecipeDetail(recipeId: number): RecipeDetail | null {
  const db = getManagedDb(DB_FILE);

  const recipe = db.prepare(`
    SELECT r.*, prof.profession_name, rt.recipe_type_name
    FROM recipes r
    LEFT JOIN professions prof ON r.profession_id = prof.profession_id
    LEFT JOIN recipe_types rt ON r.recipe_type_id = rt.recipe_type_id
    WHERE r.recipe_id = ?
  `).get(recipeId) as (Recipe & { product_id: number }) | undefined;

  if (!recipe) return null;

  const product = db.prepare('SELECT * FROM products WHERE product_id = ?')
    .get(recipe.product_id) as RecipeDetail['product'] | undefined;

  const ingredients = db.prepare(`
    SELECT ri.ingredient_id, ri.recipe_ingredients_quantity as quantity, i.ingredient_name, i.ingredient_resref
    FROM recipe_ingredients ri
    JOIN ingredients i ON ri.ingredient_id = i.ingredient_id
    WHERE ri.recipe_id = ?
    ORDER BY i.ingredient_name
  `).all(recipeId) as RecipeDetail['ingredients'];

  return {
    ...recipe,
    product: product || { product_id: 0, product_name: '', product_resref: '', product_quantity: 1, product_effects: null, product_description: null },
    ingredients,
  };
}

export function createRecipe(data: {
  recipe_name: string;
  recipe_resref: string;
  recipe_crafting_level: number;
  profession_id: number;
  recipe_type_id: number;
  product: {
    product_name: string;
    product_resref: string;
    product_quantity: number;
    product_effects?: string;
    product_description?: string;
  };
  ingredients: { ingredient_id: number; quantity: number }[];
}, user: Express.User): number {
  ensureBackup(DB_FILE);
  const db = getManagedDb(DB_FILE);

  const result = db.transaction(() => {
    // Create product
    const prodResult = db.prepare(`
      INSERT INTO products (product_name, product_resref, product_quantity, product_effects, product_description)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.product.product_name, data.product.product_resref, data.product.product_quantity,
      data.product.product_effects || null, data.product.product_description || null
    );

    const productId = prodResult.lastInsertRowid;

    // Create recipe
    const recipeResult = db.prepare(`
      INSERT INTO recipes (recipe_name, recipe_resref, recipe_crafting_level, recipe_type_id, product_id, profession_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      data.recipe_name, data.recipe_resref, data.recipe_crafting_level,
      data.recipe_type_id, productId, data.profession_id
    );

    const recipeId = Number(recipeResult.lastInsertRowid);

    // Add ingredients
    const addIngredient = db.prepare('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, recipe_ingredients_quantity) VALUES (?, ?, ?)');
    for (const ing of data.ingredients) {
      addIngredient.run(recipeId, ing.ingredient_id, ing.quantity);
    }

    return recipeId;
  })();

  logAudit(user.id, user.username, DB_FILE, 'recipes', 'INSERT', { recipe_id: result }, null, data, `Created recipe: ${data.recipe_name}`);

  return result as number;
}

export function updateRecipe(recipeId: number, data: {
  recipe_name?: string;
  recipe_resref?: string;
  recipe_crafting_level?: number;
  profession_id?: number;
  recipe_type_id?: number;
  product?: {
    product_name?: string;
    product_resref?: string;
    product_quantity?: number;
    product_effects?: string;
    product_description?: string;
  };
  ingredients?: { ingredient_id: number; quantity: number }[];
}, user: Express.User): void {
  ensureBackup(DB_FILE);
  const db = getManagedDb(DB_FILE);

  const oldRecipe = getRecipeDetail(recipeId);
  if (!oldRecipe) throw new Error(`Recipe not found: ${recipeId}`);

  db.transaction(() => {
    // Update recipe fields
    const recipeFields: string[] = [];
    const recipeValues: unknown[] = [];
    for (const key of ['recipe_name', 'recipe_resref', 'recipe_crafting_level', 'profession_id', 'recipe_type_id'] as const) {
      if ((data as any)[key] !== undefined) {
        recipeFields.push(`${key} = ?`);
        recipeValues.push((data as any)[key]);
      }
    }
    if (recipeFields.length > 0) {
      db.prepare(`UPDATE recipes SET ${recipeFields.join(', ')} WHERE recipe_id = ?`).run(...recipeValues, recipeId);
    }

    // Update product
    if (data.product && oldRecipe.product.product_id) {
      const prodFields: string[] = [];
      const prodValues: unknown[] = [];
      for (const key of ['product_name', 'product_resref', 'product_quantity', 'product_effects', 'product_description'] as const) {
        if (data.product[key] !== undefined) {
          prodFields.push(`${key} = ?`);
          prodValues.push(data.product[key]);
        }
      }
      if (prodFields.length > 0) {
        db.prepare(`UPDATE products SET ${prodFields.join(', ')} WHERE product_id = ?`).run(...prodValues, oldRecipe.product.product_id);
      }
    }

    // Replace ingredients
    if (data.ingredients) {
      db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(recipeId);
      const addIngredient = db.prepare('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, recipe_ingredients_quantity) VALUES (?, ?, ?)');
      for (const ing of data.ingredients) {
        addIngredient.run(recipeId, ing.ingredient_id, ing.quantity);
      }
    }
  })();

  logAudit(user.id, user.username, DB_FILE, 'recipes', 'UPDATE', { recipe_id: recipeId }, oldRecipe as any, data);
}

export function deleteRecipe(recipeId: number, user: Express.User): void {
  ensureBackup(DB_FILE);
  const db = getManagedDb(DB_FILE);

  const oldRecipe = getRecipeDetail(recipeId);
  if (!oldRecipe) throw new Error(`Recipe not found: ${recipeId}`);

  db.transaction(() => {
    db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(recipeId);
    db.prepare('DELETE FROM recipe_base_item_type WHERE recipe_id = ?').run(recipeId);
    db.prepare('DELETE FROM recipe_item_property WHERE recipe_id = ?').run(recipeId);
    db.prepare('DELETE FROM recipes WHERE recipe_id = ?').run(recipeId);
    // Optionally clean up orphan product
    if (oldRecipe.product.product_id) {
      const otherRefs = db.prepare('SELECT COUNT(*) as count FROM recipes WHERE product_id = ?')
        .get(oldRecipe.product.product_id) as { count: number };
      if (otherRefs.count === 0) {
        db.prepare('DELETE FROM products WHERE product_id = ?').run(oldRecipe.product.product_id);
      }
    }
  })();

  logAudit(user.id, user.username, DB_FILE, 'recipes', 'DELETE', { recipe_id: recipeId }, oldRecipe as any, null, `Deleted recipe: ${oldRecipe.recipe_name}`);
}

export function getIngredients(search?: string): { ingredient_id: number; ingredient_name: string; ingredient_resref: string }[] {
  const db = getManagedDb(DB_FILE);
  if (search) {
    const term = `%${search}%`;
    return db.prepare('SELECT * FROM ingredients WHERE ingredient_name LIKE ? OR ingredient_resref LIKE ? ORDER BY ingredient_name')
      .all(term, term) as any[];
  }
  return db.prepare('SELECT * FROM ingredients ORDER BY ingredient_name').all() as any[];
}

export interface IngredientListItem {
  ingredient_id: number;
  ingredient_name: string;
  ingredient_resref: string;
  ingredient_tier: number | null;
  yield_weight: number;
  profession_id: number | null;
  profession_name: string | null;
  profession_type: string | null;
  recipe_count: number;
}

export function getIngredientsEnhanced(params: {
  search?: string;
  professionId?: number;
  professionType?: string;
  tier?: number;
}): IngredientListItem[] {
  const db = getManagedDb(DB_FILE);
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.search) {
    conditions.push('(i.ingredient_name LIKE ? OR i.ingredient_resref LIKE ?)');
    const term = `%${params.search}%`;
    values.push(term, term);
  }
  if (params.professionId) {
    conditions.push('i.profession_id = ?');
    values.push(params.professionId);
  }
  if (params.professionType) {
    conditions.push('p.profession_type = ?');
    values.push(params.professionType);
  }
  if (params.tier) {
    conditions.push('i.ingredient_tier = ?');
    values.push(params.tier);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return db.prepare(`
    SELECT i.ingredient_id, i.ingredient_name, i.ingredient_resref, i.ingredient_tier,
           i.yield_weight, i.profession_id, p.profession_name, p.profession_type,
           (SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.ingredient_id = i.ingredient_id) as recipe_count
    FROM ingredients i
    LEFT JOIN professions p ON i.profession_id = p.profession_id
    ${where}
    ORDER BY i.ingredient_name
  `).all(...values) as IngredientListItem[];
}

export interface SecondaryYieldTierInfo {
  gather_tier: number;           // the tier being gathered (e.g. skinning a T3 creature)
  secondary_trigger_pct: number; // % chance secondary yield triggers
  pool_weight_pct: number;       // % chance of selection from pool
  pool_size: number;             // ingredients in the pool at this gather tier
  overall_pct: number;           // trigger × selection = per-gather %
}

export interface DropChanceInfo {
  // For secondary yield ingredients (mining/woodcutting/skinning)
  // Mining/woodcutting: single entry (exact tier match)
  // Skinning: multiple entries (pool uses <= tier, so higher gather tiers include more)
  secondary_yield: SecondaryYieldTierInfo[] | null;
  // For herbalism biome-based drops
  biome_drop_pcts: { biome_name: string; pct: number }[] | null;
  // For fishing
  fishing_drop_pcts: { biome_name: string; pct: number }[] | null;
}

export interface LootTableEntry {
  category: string;
  tier: string;
}

export interface StoreSourceEntry {
  store_name: string;
  store_tag: string;
  area_name: string;
  area_resref: string;
  item_cost: number;
  item_addcost: number;
  infinite: boolean;
}

export interface IngredientDetail {
  ingredient_id: number;
  ingredient_name: string;
  ingredient_resref: string;
  ingredient_tier: number | null;
  yield_weight: number;
  placeable_resref: string | null;
  source: {
    profession_id: number | null;
    profession_name: string | null;
    profession_type: string | null;
  };
  biomes: { biome_name: string; biome_description: string; spawn_rate: number }[];
  recipes: {
    recipe_id: number;
    recipe_name: string;
    recipe_resref: string;
    recipe_crafting_level: number;
    profession_name: string;
    recipe_type_name: string;
    quantity: number;
    product_name: string;
  }[];
  drop_chance: DropChanceInfo | null;
  loot_tables: LootTableEntry[];
  store_sources: StoreSourceEntry[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function calcDropChance(db: ReturnType<typeof getManagedDb>, row: any): DropChanceInfo | null {
  const profId = row.profession_id as number | null;
  const tier = row.ingredient_tier as number | null;
  if (!profId || !tier) return null;

  // Secondary yield system (mining, woodcutting, skinning)
  if (SECONDARY_YIELD_PROF_IDS.includes(profId)) {
    const weight = row.yield_weight ?? 1.0;
    const usesInclusiveTiers = INCLUSIVE_TIER_PROF_IDS.has(profId);
    // Skinning excludes primary hides from the secondary pool
    const excludeClause = profId === SKINNING_PROF_ID ? " AND ingredient_resref NOT LIKE 'hide_t%'" : '';

    // Mining & skinning use ingredient_tier <= @gatherTier, so the pool grows at higher tiers.
    // Woodcutting uses ingredient_tier = @tier (exact match), so only the ingredient's own tier matters.
    const gatherTiers = usesInclusiveTiers
      ? [1, 2, 3, 4, 5].filter(t => t >= tier)  // only tiers at or above ingredient's tier
      : [tier];

    const entries: SecondaryYieldTierInfo[] = [];

    for (const gatherTier of gatherTiers) {
      const triggerPct = SECONDARY_YIELD_CHANCES[profId]?.[gatherTier] ?? 0;
      const tierOp = usesInclusiveTiers ? '<=' : '=';

      const poolRow = db.prepare(`
        SELECT SUM(yield_weight) as total_weight, COUNT(*) as pool_size
        FROM ingredients
        WHERE profession_id = ? AND ingredient_tier ${tierOp} ?${excludeClause}
      `).get(profId, gatherTier) as { total_weight: number | null; pool_size: number };

      const totalWeight = poolRow.total_weight ?? 0;
      if (totalWeight <= 0) continue;

      const poolPct = (weight / totalWeight) * 100;
      const overallPct = (triggerPct / 100) * poolPct;

      entries.push({
        gather_tier: gatherTier,
        secondary_trigger_pct: triggerPct,
        pool_weight_pct: round2(poolPct),
        pool_size: poolRow.pool_size,
        overall_pct: round2(overallPct),
      });
    }

    if (entries.length === 0) return null;

    return {
      secondary_yield: entries,
      biome_drop_pcts: null,
      fishing_drop_pcts: null,
    };
  }

  // Herbalism: biome-based weighted drops
  if (profId === HERBALISM_PROF_ID) {
    const biomeRows = db.prepare(`
      SELECT b.biome_name, ib.spawn_rate,
             (SELECT SUM(ib2.spawn_rate) FROM ingredients_biomes ib2
              JOIN ingredients i2 ON ib2.ingredient_id = i2.ingredient_id
              WHERE ib2.biome_id = ib.biome_id AND i2.profession_id = ? AND i2.ingredient_tier = ?) as total_weight
      FROM ingredients_biomes ib
      JOIN biomes b ON ib.biome_id = b.biome_id
      WHERE ib.ingredient_id = ?
      ORDER BY b.biome_name
    `).all(HERBALISM_PROF_ID, tier, row.ingredient_id) as { biome_name: string; spawn_rate: number; total_weight: number }[];

    const biomePcts = biomeRows
      .filter(b => b.total_weight > 0)
      .map(b => ({
        biome_name: b.biome_name,
        pct: Math.round((b.spawn_rate / b.total_weight) * 100 * 100) / 100,
      }));

    return {
      secondary_yield: null,
      biome_drop_pcts: biomePcts.length > 0 ? biomePcts : null,
      fishing_drop_pcts: null,
    };
  }

  // Fishing: flat random per biome
  if (profId === FISHING_PROF_ID) {
    const biomeRows = db.prepare(`
      SELECT b.biome_name,
             (SELECT COUNT(*) FROM ingredients_biomes ib2
              JOIN ingredients i2 ON ib2.ingredient_id = i2.ingredient_id
              WHERE ib2.biome_id = ib.biome_id AND i2.profession_id = ? AND i2.ingredient_tier = ?) as pool_size
      FROM ingredients_biomes ib
      JOIN biomes b ON ib.biome_id = b.biome_id
      WHERE ib.ingredient_id = ?
      ORDER BY b.biome_name
    `).all(FISHING_PROF_ID, tier, row.ingredient_id) as { biome_name: string; pool_size: number }[];

    const fishPcts = biomeRows
      .filter(b => b.pool_size > 0)
      .map(b => ({
        biome_name: b.biome_name,
        pct: round2((1 / b.pool_size) * 100),
      }));

    return {
      secondary_yield: null,
      biome_drop_pcts: null,
      fishing_drop_pcts: fishPcts.length > 0 ? fishPcts : null,
    };
  }

  return null;
}

function findLootTableEntries(resref: string): LootTableEntry[] {
  let lootDb: ReturnType<typeof getManagedDb>;
  try {
    lootDb = getManagedDb(LOOT_DB_FILE);
  } catch {
    return [];
  }

  const entries: LootTableEntry[] = [];
  for (const cat of LOOT_CATEGORIES) {
    for (const tier of LOOT_TIERS) {
      const table = `${cat}_${tier}`;
      try {
        const row = lootDb.prepare(`SELECT 1 FROM "${table}" WHERE resref = ? LIMIT 1`).get(resref);
        if (row) {
          entries.push({ category: cat, tier });
        }
      } catch {
        // Table might not exist
      }
    }
  }
  return entries;
}

function findStoreEntries(resref: string): StoreSourceEntry[] {
  let moduleDb: ReturnType<typeof getManagedDb>;
  try {
    moduleDb = getManagedDb(MODULE_DB_FILE);
  } catch {
    return [];
  }

  try {
    return moduleDb.prepare(`
      SELECT s.LocalizedName as store_name, s.Tag as store_tag,
             a.Name as area_name, a.ResRef as area_resref,
             si.Cost as item_cost, si.AddCost as item_addcost, si.Infinite as infinite
      FROM area_store_inventory si
      JOIN area_stores s ON si.store_id = s.id
      JOIN areas a ON s.area_id = a.id
      WHERE si.TemplateResRef = ?
      ORDER BY a.Name, s.LocalizedName
    `).all(resref).map((row: any) => ({
      store_name: row.store_name ?? '',
      store_tag: row.store_tag ?? '',
      area_name: row.area_name ?? '',
      area_resref: row.area_resref ?? '',
      item_cost: row.item_cost ?? 0,
      item_addcost: row.item_addcost ?? 0,
      infinite: (row.infinite ?? 0) === 1,
    }));
  } catch {
    // Tables might not exist yet (db_module not regenerated)
    return [];
  }
}

export function getIngredientDetail(ingredientId: number): IngredientDetail | null {
  const db = getManagedDb(DB_FILE);

  const row = db.prepare(`
    SELECT i.*, p.profession_name, p.profession_type
    FROM ingredients i
    LEFT JOIN professions p ON i.profession_id = p.profession_id
    WHERE i.ingredient_id = ?
  `).get(ingredientId) as any;

  if (!row) return null;

  const biomes = db.prepare(`
    SELECT b.biome_name, b.biome_description, ib.spawn_rate
    FROM ingredients_biomes ib
    JOIN biomes b ON ib.biome_id = b.biome_id
    WHERE ib.ingredient_id = ?
    ORDER BY ib.spawn_rate DESC
  `).all(ingredientId) as IngredientDetail['biomes'];

  const recipes = db.prepare(`
    SELECT r.recipe_id, r.recipe_name, r.recipe_resref, r.recipe_crafting_level,
           ri.recipe_ingredients_quantity as quantity,
           prof.profession_name, rt.recipe_type_name,
           pr.product_name
    FROM recipe_ingredients ri
    JOIN recipes r ON ri.recipe_id = r.recipe_id
    LEFT JOIN professions prof ON r.profession_id = prof.profession_id
    LEFT JOIN recipe_types rt ON r.recipe_type_id = rt.recipe_type_id
    LEFT JOIN products pr ON r.product_id = pr.product_id
    WHERE ri.ingredient_id = ?
    ORDER BY prof.profession_name, r.recipe_crafting_level, r.recipe_name
  `).all(ingredientId) as IngredientDetail['recipes'];

  return {
    ingredient_id: row.ingredient_id,
    ingredient_name: row.ingredient_name,
    ingredient_resref: row.ingredient_resref,
    ingredient_tier: row.ingredient_tier,
    yield_weight: row.yield_weight ?? 1.0,
    placeable_resref: row.placeable_resref,
    source: {
      profession_id: row.profession_id,
      profession_name: row.profession_name,
      profession_type: row.profession_type,
    },
    biomes,
    recipes,
    drop_chance: calcDropChance(db, row),
    loot_tables: findLootTableEntries(row.ingredient_resref),
    store_sources: findStoreEntries(row.ingredient_resref),
  };
}

export function createIngredient(data: { ingredient_name: string; ingredient_resref: string }, user: Express.User): number {
  ensureBackup(DB_FILE);
  const db = getManagedDb(DB_FILE);
  const result = db.prepare('INSERT INTO ingredients (ingredient_name, ingredient_resref) VALUES (?, ?)')
    .run(data.ingredient_name, data.ingredient_resref);
  logAudit(user.id, user.username, DB_FILE, 'ingredients', 'INSERT', { ingredient_id: result.lastInsertRowid }, null, data);
  return Number(result.lastInsertRowid);
}

export function updateIngredient(ingredientId: number, data: {
  ingredient_name?: string;
  ingredient_resref?: string;
  yield_weight?: number;
  ingredient_tier?: number | null;
  profession_id?: number | null;
}, user: Express.User): void {
  ensureBackup(DB_FILE);
  const db = getManagedDb(DB_FILE);

  const old = db.prepare('SELECT * FROM ingredients WHERE ingredient_id = ?').get(ingredientId);
  if (!old) throw new Error(`Ingredient not found: ${ingredientId}`);

  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.ingredient_name !== undefined) { fields.push('ingredient_name = ?'); values.push(data.ingredient_name); }
  if (data.ingredient_resref !== undefined) { fields.push('ingredient_resref = ?'); values.push(data.ingredient_resref); }
  if (data.yield_weight !== undefined) { fields.push('yield_weight = ?'); values.push(data.yield_weight); }
  if ('ingredient_tier' in data) { fields.push('ingredient_tier = ?'); values.push(data.ingredient_tier); }
  if ('profession_id' in data) { fields.push('profession_id = ?'); values.push(data.profession_id); }

  if (fields.length > 0) {
    db.prepare(`UPDATE ingredients SET ${fields.join(', ')} WHERE ingredient_id = ?`).run(...values, ingredientId);
  }

  logAudit(user.id, user.username, DB_FILE, 'ingredients', 'UPDATE', { ingredient_id: ingredientId }, old as any, data);
}

export function deleteIngredient(ingredientId: number, user: Express.User): void {
  const db = getManagedDb(DB_FILE);

  // Check for references
  const refs = db.prepare('SELECT COUNT(*) as count FROM recipe_ingredients WHERE ingredient_id = ?')
    .get(ingredientId) as { count: number };
  if (refs.count > 0) {
    throw new Error(`Cannot delete ingredient: used in ${refs.count} recipe(s)`);
  }

  ensureBackup(DB_FILE);

  const old = db.prepare('SELECT * FROM ingredients WHERE ingredient_id = ?').get(ingredientId);
  if (!old) throw new Error(`Ingredient not found: ${ingredientId}`);

  db.prepare('DELETE FROM ingredients WHERE ingredient_id = ?').run(ingredientId);
  logAudit(user.id, user.username, DB_FILE, 'ingredients', 'DELETE', { ingredient_id: ingredientId }, old as any, null);
}

export function getProfessions(): { profession_id: number; profession_name: string; profession_type: string }[] {
  return getManagedDb(DB_FILE).prepare('SELECT profession_id, profession_name, profession_type FROM professions ORDER BY profession_type, profession_name').all() as any[];
}

export function getRecipeTypes(): { recipe_type_id: number; recipe_type_name: string }[] {
  return getManagedDb(DB_FILE).prepare('SELECT * FROM recipe_types ORDER BY recipe_type_name').all() as any[];
}

export function getProducts(search?: string): { product_id: number; product_name: string; product_resref: string }[] {
  const db = getManagedDb(DB_FILE);
  if (search) {
    const term = `%${search}%`;
    return db.prepare('SELECT product_id, product_name, product_resref FROM products WHERE product_name LIKE ? OR product_resref LIKE ? ORDER BY product_name')
      .all(term, term) as any[];
  }
  return db.prepare('SELECT product_id, product_name, product_resref FROM products ORDER BY product_name').all() as any[];
}
