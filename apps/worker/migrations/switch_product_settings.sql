CREATE TABLE IF NOT EXISTS switch_product_settings (
  product_id   TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  estimate_note TEXT,
  sort_order   INTEGER DEFAULT 0,
  is_active    INTEGER DEFAULT 1,
  updated_at   TEXT
);

INSERT OR IGNORE INTO switch_product_settings (product_id, name, sort_order) VALUES
  ('prod-swn-0001-0000-0000-000000000004', 'Nintendo Switch',   1),
  ('prod-swl-0001-0000-0000-000000000005', 'Switch Lite',       2),
  ('prod-swo-0001-0000-0000-000000000006', 'Switch 有機EL',     3),
  ('prod-sw2-0001-0000-0000-000000000007', 'Nintendo Switch 2', 4);
