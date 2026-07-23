CREATE TABLE IF NOT EXISTS line_groups (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  channel_id TEXT,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(group_id)
);
