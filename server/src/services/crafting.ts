import { getManagedDb } from '../db/managed-db';
import { ensureBackup } from './backup';
import { logAudit } from '../db/app-db';
import { Recipe, RecipeDetail, PaginatedResponse } from '../types';

const DB_FILE = 'db_crafting.sqlite3';

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

export function createIngredient(data: { ingredient_name: string; ingredient_resref: string }, user: Express.User): number {
  ensureBackup(DB_FILE);
  const db = getManagedDb(DB_FILE);
  const result = db.prepare('INSERT INTO ingredients (ingredient_name, ingredient_resref) VALUES (?, ?)')
    .run(data.ingredient_name, data.ingredient_resref);
  logAudit(user.id, user.username, DB_FILE, 'ingredients', 'INSERT', { ingredient_id: result.lastInsertRowid }, null, data);
  return Number(result.lastInsertRowid);
}

export function updateIngredient(ingredientId: number, data: { ingredient_name?: string; ingredient_resref?: string }, user: Express.User): void {
  ensureBackup(DB_FILE);
  const db = getManagedDb(DB_FILE);

  const old = db.prepare('SELECT * FROM ingredients WHERE ingredient_id = ?').get(ingredientId);
  if (!old) throw new Error(`Ingredient not found: ${ingredientId}`);

  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.ingredient_name !== undefined) { fields.push('ingredient_name = ?'); values.push(data.ingredient_name); }
  if (data.ingredient_resref !== undefined) { fields.push('ingredient_resref = ?'); values.push(data.ingredient_resref); }

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

export function getProfessions(): { profession_id: number; profession_name: string }[] {
  return getManagedDb(DB_FILE).prepare('SELECT * FROM professions ORDER BY profession_name').all() as any[];
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
