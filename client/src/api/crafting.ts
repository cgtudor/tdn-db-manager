import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type { PaginatedResponse, Recipe, RecipeDetail, Ingredient } from '../types';

export function getRecipes(params?: {
  profession_id?: number;
  type_id?: number;
  level_min?: number;
  level_max?: number;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<Recipe>> {
  const sp = new URLSearchParams();
  if (params?.profession_id) sp.set('profession_id', String(params.profession_id));
  if (params?.type_id) sp.set('type_id', String(params.type_id));
  if (params?.level_min) sp.set('level_min', String(params.level_min));
  if (params?.level_max) sp.set('level_max', String(params.level_max));
  if (params?.search) sp.set('search', params.search);
  if (params?.page) sp.set('page', String(params.page));
  if (params?.limit) sp.set('limit', String(params.limit));
  const qs = sp.toString();
  return apiGet(`/api/crafting/recipes${qs ? `?${qs}` : ''}`);
}

export function getRecipeDetail(id: number): Promise<RecipeDetail> {
  return apiGet(`/api/crafting/recipes/${id}`);
}

export function createRecipe(data: unknown): Promise<{ recipe_id: number }> {
  return apiPost('/api/crafting/recipes', data);
}

export function updateRecipe(id: number, data: unknown): Promise<void> {
  return apiPut(`/api/crafting/recipes/${id}`, data);
}

export function deleteRecipe(id: number): Promise<void> {
  return apiDelete(`/api/crafting/recipes/${id}`);
}

export function getIngredients(search?: string): Promise<Ingredient[]> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiGet(`/api/crafting/ingredients${qs}`);
}

export function createIngredient(data: { ingredient_name: string; ingredient_resref: string }): Promise<{ ingredient_id: number }> {
  return apiPost('/api/crafting/ingredients', data);
}

export function updateIngredient(id: number, data: unknown): Promise<void> {
  return apiPut(`/api/crafting/ingredients/${id}`, data);
}

export function deleteIngredient(id: number): Promise<void> {
  return apiDelete(`/api/crafting/ingredients/${id}`);
}

export function getProfessions(): Promise<{ profession_id: number; profession_name: string }[]> {
  return apiGet('/api/crafting/professions');
}

export function getRecipeTypes(): Promise<{ recipe_type_id: number; recipe_type_name: string }[]> {
  return apiGet('/api/crafting/recipe-types');
}
