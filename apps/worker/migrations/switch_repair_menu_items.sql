CREATE TABLE IF NOT EXISTS switch_repair_menu_items (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  price_from INTEGER,
  price_to   INTEGER,
  sort_order INTEGER DEFAULT 0,
  is_active  INTEGER DEFAULT 1,
  updated_at TEXT
);
