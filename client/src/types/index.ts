export type UserRole = 'admin' | 'editor' | 'viewer';

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
}

export interface Ingredient {
  ingredient_id: number;
  ingredient_name: string;
  ingredient_resref: string;
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
