import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type { LootCategory, LootItem } from '../types';

export function getLootOverview(): Promise<LootCategory[]> {
  return apiGet('/api/loot/overview');
}

export function getLootCategories(): Promise<{ categories: string[]; tiers: string[] }> {
  return apiGet('/api/loot/categories');
}

export function getCategoryItems(category: string): Promise<Record<string, LootItem[]>> {
  return apiGet(`/api/loot/${category}`);
}

export function addLootItem(category: string, tier: string, item: LootItem): Promise<void> {
  return apiPost(`/api/loot/${category}/${tier}`, item);
}

export function updateLootItem(category: string, tier: string, resref: string, name: string): Promise<void> {
  return apiPut(`/api/loot/${category}/${tier}/${resref}`, { name });
}

export function removeLootItem(category: string, tier: string, resref: string): Promise<void> {
  return apiDelete(`/api/loot/${category}/${tier}/${resref}`);
}

export function moveLootItems(
  items: LootItem[],
  from: { category: string; tier: string },
  to: { category: string; tier: string }
): Promise<void> {
  return apiPost('/api/loot/move', { items, from, to });
}

export function searchLoot(query: string): Promise<{ category: string; tier: string; resref: string; name: string }[]> {
  return apiGet(`/api/loot/search?q=${encodeURIComponent(query)}`);
}
