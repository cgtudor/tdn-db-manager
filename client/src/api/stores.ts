import { apiGet } from './client';

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

export function getStores(params?: { search?: string; area?: string }): Promise<StoreListItem[]> {
  const sp = new URLSearchParams();
  if (params?.search) sp.set('search', params.search);
  if (params?.area) sp.set('area', params.area);
  const qs = sp.toString();
  return apiGet(`/api/stores${qs ? `?${qs}` : ''}`);
}

export function getStoreDetail(id: number): Promise<StoreDetail> {
  return apiGet(`/api/stores/${id}`);
}

export function getStoreAreas(): Promise<{ resref: string; name: string }[]> {
  return apiGet('/api/stores/areas');
}
