export type UserRole = 'admin' | 'dm' | 'editor' | 'viewer';

export interface AuthUser {
  id: string;
  username: string;
  avatar: string | null;
  role: UserRole;
}

export interface AuthStatus {
  authenticated: boolean;
  user: AuthUser | null;
}

export interface DatabaseInfo {
  filename: string;
  displayName: string;
  sizeBytes: number;
  lastModified: string;
  tableCount: number;
  editorAccess: 'read' | 'write';
  description: string | null;
}

export interface TableSchema {
  name: string;
  columns: ColumnInfo[];
  primaryKey: string[];
  rowCount: number;
}

export interface ColumnInfo {
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
}

export interface DatabaseDetail {
  filename: string;
  sizeBytes: number;
  lastModified: string;
  tables: TableSchema[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LootItem {
  resref: string;
  name: string;
}

export interface LootCategory {
  name: string;
  tierCounts: Record<string, number>;
  tiers: Record<string, LootItem[]>;
}

export interface Recipe {
  recipe_id: number;
  recipe_name: string;
  recipe_resref: string;
  recipe_crafting_level: number;
  profession_name: string;
  profession_id: number;
  recipe_type_name: string;
  recipe_type_id: number;
  product_id: number;
}

export interface RecipeDetail extends Recipe {
  product: {
    product_id: number;
    product_name: string;
    product_resref: string;
    product_quantity: number;
    product_effects: string | null;
    product_description: string | null;
  };
  ingredients: {
    ingredient_id: number;
    ingredient_name: string;
    ingredient_resref: string;
    quantity: number;
  }[];
  store_sources: StoreSourceEntry[];
}

export interface Ingredient {
  ingredient_id: number;
  ingredient_name: string;
  ingredient_resref: string;
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

export interface SecondaryYieldTierInfo {
  gather_tier: number;
  secondary_trigger_pct: number;
  pool_weight_pct: number;
  pool_size: number;
  overall_pct: number;
}

export interface DropChanceInfo {
  secondary_yield: SecondaryYieldTierInfo[] | null;
  biome_drop_pcts: { biome_name: string; pct: number }[] | null;
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
  item_value: number;
  store_buy_price: number;
  store_markup: number;
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

export interface AuditEntry {
  id: number;
  user_discord_id: string;
  username: string;
  database_name: string;
  table_name: string;
  action: string;
  row_identifier: string | null;
  old_values: string | null;
  new_values: string | null;
  description: string | null;
  created_at: string;
}

export interface BackupEntry {
  database: string;
  timestamp: string;
  sizeBytes: number;
  path: string;
}

export interface AppUser {
  discord_id: string;
  username: string;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  last_login_at: string | null;
}

export interface SearchResult {
  database: string;
  table: string;
  column: string;
  value: string;
  rowid: number;
}

// ─── Live Dashboard Types ──────────────────────────────────

export interface ServerStatus {
  playerCount: number;
  lastHeartbeat: number;
  redisConnected: boolean;
}

export interface OnlinePlayer {
  uuid: string;
  name: string;
  player: string;
  area: string;
  areaTag: string;
  hp: string;
  level: number;
  loginTime: number;
}

export interface AreaPopulation {
  areaTag: string;
  playerCount: number;
  players: { uuid: string; name: string }[];
}

export interface ChatMessage {
  id: string;
  speaker: string;
  channel: string;
  msg: string;
  areaTag: string;
  areaName: string;
  ts: number;
}

export interface ActivityEvent {
  id: string;
  type: string;
  player: string;
  detail: string;
  area?: string;
  ts: number;
}

export interface PlayerStreamData {
  players: OnlinePlayer[];
  areas: AreaPopulation[];
  status: ServerStatus;
}
