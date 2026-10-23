CREATE TABLE table_members (
  email TEXT PRIMARY KEY NOT NULL,
  user_id TEXT,
  role TEXT NOT NULL DEFAULT 'player',
  active INTEGER NOT NULL DEFAULT 1,
  invited_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE characters (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX characters_owner_idx ON characters(owner_id);
CREATE TABLE legacy_migrations (
  user_id TEXT PRIMARY KEY NOT NULL,
  migrated_at TEXT NOT NULL
);
