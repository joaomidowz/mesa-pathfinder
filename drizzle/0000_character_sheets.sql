CREATE TABLE IF NOT EXISTS character_sheets (
  user_id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
