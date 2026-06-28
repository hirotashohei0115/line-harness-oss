CREATE TABLE IF NOT EXISTS switch_repair_prices (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK(category IN ('main', 'controller')),
  model TEXT NOT NULL,
  symptom TEXT NOT NULL,
  price_min INTEGER,
  price_max INTEGER,
  is_consultation INTEGER NOT NULL DEFAULT 0,
  is_not_applicable INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ===== 本体 =====
-- 液晶不良
INSERT INTO switch_repair_prices VALUES ('m-sw-ekisho',    'main','Switch',       '液晶不良', 11000,NULL,0,0,NULL,10,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sl-ekisho',    'main','Switch Lite',  '液晶不良', 11000,NULL,0,0,NULL,10,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sy-ekisho',    'main','Switch有機EL', '液晶不良', 25500,NULL,0,0,NULL,10,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-s2-ekisho',    'main','Switch 2',     '液晶不良',  NULL,NULL,1,0,NULL,10,'2026-06-28T00:00:00','2026-06-28T00:00:00');
-- 画面割れ
INSERT INTO switch_repair_prices VALUES ('m-sw-gamen',     'main','Switch',       '画面割れ',  7900,NULL,0,0,NULL,20,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sl-gamen',     'main','Switch Lite',  '画面割れ',  7900,NULL,0,0,NULL,20,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sy-gamen',     'main','Switch有機EL', '画面割れ', 25500,NULL,0,0,NULL,20,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-s2-gamen',     'main','Switch 2',     '画面割れ',  NULL,NULL,1,0,NULL,20,'2026-06-28T00:00:00','2026-06-28T00:00:00');
-- バッテリー
INSERT INTO switch_repair_prices VALUES ('m-sw-battery',   'main','Switch',       'バッテリー', 6900,NULL,0,0,'他修理とセットなら+¥2,900',30,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sl-battery',   'main','Switch Lite',  'バッテリー', 6900,NULL,0,0,'他修理とセットなら+¥2,900',30,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sy-battery',   'main','Switch有機EL', 'バッテリー', 6900,NULL,0,0,'他修理とセットなら+¥2,900',30,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-s2-battery',   'main','Switch 2',     'バッテリー',12000,NULL,0,0,NULL,30,'2026-06-28T00:00:00','2026-06-28T00:00:00');
-- ゲームスロット
INSERT INTO switch_repair_prices VALUES ('m-sw-game',      'main','Switch',       'ゲームスロット', 9900,NULL,0,0,NULL,40,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sl-game',      'main','Switch Lite',  'ゲームスロット', 9900,NULL,0,0,NULL,40,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sy-game',      'main','Switch有機EL', 'ゲームスロット', 9900,NULL,0,0,NULL,40,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-s2-game',      'main','Switch 2',     'ゲームスロット', NULL,NULL,1,0,NULL,40,'2026-06-28T00:00:00','2026-06-28T00:00:00');
-- SDカードスロット
INSERT INTO switch_repair_prices VALUES ('m-sw-sd',        'main','Switch',       'SDカードスロット', 6300,NULL,0,0,NULL,50,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sl-sd',        'main','Switch Lite',  'SDカードスロット',15000,NULL,0,0,NULL,50,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sy-sd',        'main','Switch有機EL', 'SDカードスロット', 9900,NULL,0,0,NULL,50,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-s2-sd',        'main','Switch 2',     'SDカードスロット',13000,NULL,0,0,NULL,50,'2026-06-28T00:00:00','2026-06-28T00:00:00');
-- イヤホンジャック
INSERT INTO switch_repair_prices VALUES ('m-sw-earphone',  'main','Switch',       'イヤホンジャック', 9900,NULL,0,0,NULL,60,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sl-earphone',  'main','Switch Lite',  'イヤホンジャック', 9900,NULL,0,0,NULL,60,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sy-earphone',  'main','Switch有機EL', 'イヤホンジャック', 9900,NULL,0,0,NULL,60,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-s2-earphone',  'main','Switch 2',     'イヤホンジャック',11000,NULL,0,0,NULL,60,'2026-06-28T00:00:00','2026-06-28T00:00:00');
-- レール
INSERT INTO switch_repair_prices VALUES ('m-sw-rail',      'main','Switch',       'レール', 6500,NULL,0,0,NULL,70,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sl-rail',      'main','Switch Lite',  'レール',  NULL,NULL,0,1,NULL,70,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sy-rail',      'main','Switch有機EL', 'レール', 6500,NULL,0,0,NULL,70,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-s2-rail',      'main','Switch 2',     'レール', 8800,NULL,0,0,NULL,70,'2026-06-28T00:00:00','2026-06-28T00:00:00');
-- ファン
INSERT INTO switch_repair_prices VALUES ('m-sw-fan',       'main','Switch',       'ファン', 6900,NULL,0,0,NULL,80,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sl-fan',       'main','Switch Lite',  'ファン', 6900,NULL,0,0,NULL,80,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sy-fan',       'main','Switch有機EL', 'ファン', 6900,NULL,0,0,NULL,80,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-s2-fan',       'main','Switch 2',     'ファン',  NULL,NULL,1,0,NULL,80,'2026-06-28T00:00:00','2026-06-28T00:00:00');
-- 電源ボタン
INSERT INTO switch_repair_prices VALUES ('m-sw-power',     'main','Switch',       '電源ボタン', 7000,NULL,0,0,NULL,90,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sl-power',     'main','Switch Lite',  '電源ボタン', 7000,NULL,0,0,NULL,90,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sy-power',     'main','Switch有機EL', '電源ボタン', 7000,NULL,0,0,NULL,90,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-s2-power',     'main','Switch 2',     '電源ボタン', NULL,NULL,0,1,NULL,90,'2026-06-28T00:00:00','2026-06-28T00:00:00');
-- スピーカー
INSERT INTO switch_repair_prices VALUES ('m-sw-speaker',   'main','Switch',       'スピーカー', 7700,NULL,0,0,NULL,100,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sl-speaker',   'main','Switch Lite',  'スピーカー', 7700,NULL,0,0,NULL,100,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sy-speaker',   'main','Switch有機EL', 'スピーカー', 7700,NULL,0,0,NULL,100,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-s2-speaker',   'main','Switch 2',     'スピーカー', 8800,NULL,0,0,NULL,100,'2026-06-28T00:00:00','2026-06-28T00:00:00');
-- フィルム
INSERT INTO switch_repair_prices VALUES ('m-sw-film',      'main','Switch',       'フィルム', 2400,NULL,0,0,'他修理とセットなら+¥1,000',110,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sl-film',      'main','Switch Lite',  'フィルム', 2400,NULL,0,0,'他修理とセットなら+¥1,000',110,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sy-film',      'main','Switch有機EL', 'フィルム', 2400,NULL,0,0,'他修理とセットなら+¥1,000',110,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-s2-film',      'main','Switch 2',     'フィルム', 2400,NULL,0,0,'他修理とセットなら+¥1,000',110,'2026-06-28T00:00:00','2026-06-28T00:00:00');
-- 充電口
INSERT INTO switch_repair_prices VALUES ('m-sw-charge',    'main','Switch',       '充電口', 16500,23500,0,0,NULL,120,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sl-charge',    'main','Switch Lite',  '充電口', 16500,23500,0,0,NULL,120,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sy-charge',    'main','Switch有機EL', '充電口', 16500,23500,0,0,NULL,120,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-s2-charge',    'main','Switch 2',     '充電口', 25000, NULL,0,0,NULL,120,'2026-06-28T00:00:00','2026-06-28T00:00:00');
-- 基板
INSERT INTO switch_repair_prices VALUES ('m-sw-kiban',     'main','Switch',       '基板', 18000,NULL,0,0,NULL,130,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sl-kiban',     'main','Switch Lite',  '基板', 18000,NULL,0,0,NULL,130,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-sy-kiban',     'main','Switch有機EL', '基板', 18000,NULL,0,0,NULL,130,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('m-s2-kiban',     'main','Switch 2',     '基板', 25000,NULL,0,0,NULL,130,'2026-06-28T00:00:00','2026-06-28T00:00:00');

-- ===== コントローラー =====
-- スティック
INSERT INTO switch_repair_prices VALUES ('c-jc-stick',     'controller','Joy-Con',         'スティック', 2500,NULL,0,0,NULL,10,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('c-pc-stick',     'controller','Proコン',          'スティック', 5000,NULL,0,0,NULL,10,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('c-sl-stick',     'controller','Switch Lite (コン)','スティック', 3500,4500,0,0,'左:¥3,500 右:¥4,500',10,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('c-j2-stick',     'controller','Joy-Con 2',        'スティック', 4400,NULL,0,0,NULL,10,'2026-06-28T00:00:00','2026-06-28T00:00:00');
-- ボタン
INSERT INTO switch_repair_prices VALUES ('c-jc-button',    'controller','Joy-Con',         'ボタン', 2500,NULL,0,0,NULL,20,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('c-pc-button',    'controller','Proコン',          'ボタン',  NULL,NULL,0,1,NULL,20,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('c-sl-button',    'controller','Switch Lite (コン)','ボタン',  NULL,NULL,0,1,NULL,20,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('c-j2-button',    'controller','Joy-Con 2',        'ボタン',  NULL,NULL,1,0,NULL,20,'2026-06-28T00:00:00','2026-06-28T00:00:00');
-- バイブレーター
INSERT INTO switch_repair_prices VALUES ('c-jc-vibe',      'controller','Joy-Con',         'バイブレーター', 2500,NULL,0,0,NULL,30,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('c-pc-vibe',      'controller','Proコン',          'バイブレーター', NULL,NULL,0,1,NULL,30,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('c-sl-vibe',      'controller','Switch Lite (コン)','バイブレーター',NULL,NULL,0,1,NULL,30,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('c-j2-vibe',      'controller','Joy-Con 2',        'バイブレーター',NULL,NULL,1,0,NULL,30,'2026-06-28T00:00:00','2026-06-28T00:00:00');
-- バッテリー
INSERT INTO switch_repair_prices VALUES ('c-jc-bat',       'controller','Joy-Con',         'バッテリー', 2500,NULL,0,0,NULL,40,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('c-pc-bat',       'controller','Proコン',          'バッテリー', NULL,NULL,0,1,NULL,40,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('c-sl-bat',       'controller','Switch Lite (コン)','バッテリー',NULL,NULL,0,1,NULL,40,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('c-j2-bat',       'controller','Joy-Con 2',        'バッテリー',NULL,NULL,1,0,NULL,40,'2026-06-28T00:00:00','2026-06-28T00:00:00');
-- レール
INSERT INTO switch_repair_prices VALUES ('c-jc-rail',      'controller','Joy-Con',         'レール', 2500,NULL,0,0,NULL,50,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('c-pc-rail',      'controller','Proコン',          'レール',  NULL,NULL,0,1,NULL,50,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('c-sl-rail',      'controller','Switch Lite (コン)','レール',  NULL,NULL,0,1,NULL,50,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('c-j2-rail',      'controller','Joy-Con 2',        'レール', 8800,NULL,0,0,NULL,50,'2026-06-28T00:00:00','2026-06-28T00:00:00');
-- 外装
INSERT INTO switch_repair_prices VALUES ('c-jc-gaiso',     'controller','Joy-Con',         '外装', 2500,NULL,0,0,NULL,60,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('c-pc-gaiso',     'controller','Proコン',          '外装',  NULL,NULL,0,1,NULL,60,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('c-sl-gaiso',     'controller','Switch Lite (コン)','外装',  NULL,NULL,0,1,NULL,60,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('c-j2-gaiso',     'controller','Joy-Con 2',        '外装',  NULL,NULL,1,0,NULL,60,'2026-06-28T00:00:00','2026-06-28T00:00:00');
-- 同時修理
INSERT INTO switch_repair_prices VALUES ('c-jc-doji',      'controller','Joy-Con',         '同時修理', 1000,NULL,0,0,'一箇所につき+¥1,000',70,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('c-pc-doji',      'controller','Proコン',          '同時修理',  NULL,NULL,0,1,NULL,70,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('c-sl-doji',      'controller','Switch Lite (コン)','同時修理',  NULL,NULL,0,1,NULL,70,'2026-06-28T00:00:00','2026-06-28T00:00:00');
INSERT INTO switch_repair_prices VALUES ('c-j2-doji',      'controller','Joy-Con 2',        '同時修理',  NULL,NULL,1,0,NULL,70,'2026-06-28T00:00:00','2026-06-28T00:00:00');
