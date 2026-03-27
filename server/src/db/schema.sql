CREATE TABLE IF NOT EXISTS users (
    discord_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('admin', 'editor', 'viewer')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
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

CREATE INDEX IF NOT EXISTS idx_audit_log_database ON audit_log(database_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_discord_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS database_config (
    db_filename TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    editor_access TEXT NOT NULL DEFAULT 'read' CHECK(editor_access IN ('read', 'write')),
    description TEXT,
    sort_order INTEGER DEFAULT 100
);
