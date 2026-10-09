-- Sync SwitchMaster LINE 仮見積もり prices with https://switchmaster.jp/price-list/ (2026-10-09)
-- 対象: 修理メニュー (switch_repair_menu_items) / 症状 (repair_prices) / 管理用料金表 (switch_repair_prices)

-- ===== 修理メニューで選ぶ (switch_repair_menu_items) =====
-- Nintendo Switch
UPDATE switch_repair_menu_items SET price_from = 12000, price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = '3a69599b-1fa8-49ea-b175-c9c6e37ad80d'; -- 液晶不良
UPDATE switch_repair_menu_items SET price_from = 8900,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = '8cc58d8c-cf6a-451c-8131-a5d14b0462d9'; -- 画面割れ
UPDATE switch_repair_menu_items SET price_from = 7900,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = '7c44edb0-fb8e-4bed-aa92-8c679632d08a'; -- バッテリー
UPDATE switch_repair_menu_items SET price_from = 10400, price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = '590691e4-7c3c-43d5-bf78-887d022f365c'; -- ゲームスロット
UPDATE switch_repair_menu_items SET price_from = 6800,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = '95ba31a7-a1e4-4e06-88d8-e66a18dc6feb'; -- SDカードスロット
UPDATE switch_repair_menu_items SET price_from = 7000,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'ee3d0c5a-3e75-4cd1-b081-7f69eac3325c'; -- レール
UPDATE switch_repair_menu_items SET price_from = 2700,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'fa1dcdc6-324e-4dc8-af17-4385eb95d504'; -- Joy-Con スティック
UPDATE switch_repair_menu_items SET price_from = 2700,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'e2ec4d2b-a105-4794-a115-02e12abaa549'; -- Joy-Con ボタン
UPDATE switch_repair_menu_items SET price_from = 2700,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'e65a4391-ca3b-47ec-88fb-82f527a14264'; -- Joy-Con バイブレーター
UPDATE switch_repair_menu_items SET price_from = 2700,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'd13789a2-bb65-4a4a-a72d-037207e8e25c'; -- Joy-Con バッテリー
UPDATE switch_repair_menu_items SET price_from = 2700,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'cdd4893b-b81e-4cb6-9153-a7dc050865a1'; -- Joy-Con レール
UPDATE switch_repair_menu_items SET price_from = 2700,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'aade436d-8eaf-4512-b495-bd2e3e438831'; -- Joy-Con 外装

-- Switch Lite
UPDATE switch_repair_menu_items SET price_from = 12000, price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = '394b03be-1ad7-45f0-9e7e-2b5e620a63c2'; -- 液晶不良
UPDATE switch_repair_menu_items SET price_from = 8900,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = '8e5e1275-5181-41ff-b3ab-a5069da33d7f'; -- 画面割れ
UPDATE switch_repair_menu_items SET price_from = 7900,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = '1099be2e-611c-49ed-8590-166901478d22'; -- バッテリー
UPDATE switch_repair_menu_items SET price_from = 10400, price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'c36ad1ba-1d2e-4e29-9384-6c3ace908269'; -- ゲームスロット
UPDATE switch_repair_menu_items SET price_from = 15500, price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'd60048a2-8efd-4bee-aa26-80533e62b4f7'; -- SDカードスロット

-- Switch OLED
UPDATE switch_repair_menu_items SET price_from = 7900,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = '94f5a04a-911e-438e-98f9-51e3bf028e31'; -- バッテリー
UPDATE switch_repair_menu_items SET price_from = 10400, price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'a6401e95-97c1-4ca2-b97f-0daffe5e0f95'; -- ゲームスロット
UPDATE switch_repair_menu_items SET price_from = 10400, price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = '3a274637-867b-4fa4-96c5-45ebd41433ac'; -- SDカードスロット
UPDATE switch_repair_menu_items SET price_from = 7000,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'aa8b9008-fd70-456f-aad6-3b98825a3884'; -- レール
UPDATE switch_repair_menu_items SET price_from = 2700,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'd604a621-cd5b-4787-927c-dd0912487181'; -- Joy-Con スティック
UPDATE switch_repair_menu_items SET price_from = 2700,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = '36ca0569-015b-4966-a961-4ce249d4d413'; -- Joy-Con ボタン
UPDATE switch_repair_menu_items SET price_from = 2700,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = '3c7259bc-c753-4a22-88c1-fd504e98b523'; -- Joy-Con バイブレーター
UPDATE switch_repair_menu_items SET price_from = 2700,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = '898fce6b-62ac-4ff0-bf48-900a18402549'; -- Joy-Con バッテリー
UPDATE switch_repair_menu_items SET price_from = 2700,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = '4548d6a6-ff39-4a81-b5c5-1db4c035db30'; -- Joy-Con レール
UPDATE switch_repair_menu_items SET price_from = 2700,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = '81490e7c-bd9d-4bb8-a93a-910c089f31ae'; -- Joy-Con 外装

-- Nintendo Switch 2
UPDATE switch_repair_menu_items SET price_from = 46000, price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = '96233f26-5263-4aa5-bc90-c42892d195fc'; -- 液晶不良
UPDATE switch_repair_menu_items SET price_from = 46000, price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'c7572151-b05e-4532-b8c1-53fa401cfdba'; -- 画面割れ
UPDATE switch_repair_menu_items SET price_from = 13000, price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'f69f75cf-fd18-4868-b34e-ef454c256958'; -- バッテリー
UPDATE switch_repair_menu_items SET price_from = 19500, price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'a26b4ff0-a66a-44a3-ab12-14178bc5603a'; -- ゲームスロット
UPDATE switch_repair_menu_items SET price_from = 13500, price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'b4200dc2-75cb-4ec9-8351-561e9ba93b0b'; -- SDカードスロット
UPDATE switch_repair_menu_items SET price_from = 9300,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'fd58b440-b935-4784-b576-7d026dfb7d67'; -- レール
UPDATE switch_repair_menu_items SET price_from = 7900,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = '59d48f97-da28-470e-9caf-52639693b862'; -- ファン
UPDATE switch_repair_menu_items SET price_from = 8000,  price_to = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = '8a238924-c76a-482a-af16-b9c9d4b1c35d'; -- 電源ボタン

-- ===== 症状で選ぶ (repair_prices) =====
-- Nintendo Switch
UPDATE repair_prices SET price_from = 2700,  price_to = NULL,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swn-0001'; -- Joy-conスティック不具合
UPDATE repair_prices SET price_from = 2700,  price_to = NULL,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swn-0002'; -- Joy-conボタン不具合
UPDATE repair_prices SET price_from = 8900,  price_to = 12000, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swn-0003'; -- 画面割れ・液晶不良
UPDATE repair_prices SET price_from = 7900,  price_to = 23500, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swn-0004'; -- 充電できない
UPDATE repair_prices SET price_from = 7900,  price_to = 23500, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swn-0005'; -- 電源が入らない
UPDATE repair_prices SET price_from = 7900,  price_to = NULL,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swn-0006'; -- バッテリー交換
UPDATE repair_prices SET price_from = 9900,  price_to = NULL,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swn-0007'; -- 水没修理
UPDATE repair_prices SET price_from = 10400, price_to = NULL,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swn-0008'; -- ゲームカードスロット不具合

-- Switch Lite (サイトにLiteのボタン単体価格はないため要問い合わせ)
UPDATE repair_prices SET price_from = 3500,  price_to = 4500,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swl-0001'; -- スティック不具合 (左¥3,500 / 右¥4,500)
UPDATE repair_prices SET price_from = 0,     price_to = NULL,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swl-0002'; -- ボタン不具合
UPDATE repair_prices SET price_from = 8900,  price_to = 12000, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swl-0003'; -- 画面割れ・液晶不良
UPDATE repair_prices SET price_from = 7900,  price_to = 23500, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swl-0004'; -- 充電できない
UPDATE repair_prices SET price_from = 7900,  price_to = 23500, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swl-0005'; -- 電源が入らない
UPDATE repair_prices SET price_from = 7900,  price_to = NULL,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swl-0006'; -- バッテリー交換
UPDATE repair_prices SET price_from = 9900,  price_to = NULL,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swl-0007'; -- 水没修理
UPDATE repair_prices SET price_from = 10400, price_to = NULL,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swl-0008'; -- ゲームカードスロット不具合

-- Switch OLED
UPDATE repair_prices SET price_from = 2700,  price_to = NULL,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swo-0001'; -- Joy-conスティック不具合
UPDATE repair_prices SET price_from = 2700,  price_to = NULL,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swo-0002'; -- Joy-conボタン不具合
UPDATE repair_prices SET price_from = 7900,  price_to = 23500, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swo-0004'; -- 充電できない
UPDATE repair_prices SET price_from = 7900,  price_to = 23500, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swo-0005'; -- 電源が入らない
UPDATE repair_prices SET price_from = 7900,  price_to = NULL,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swo-0006'; -- バッテリー交換
UPDATE repair_prices SET price_from = 9900,  price_to = NULL,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swo-0007'; -- 水没修理
UPDATE repair_prices SET price_from = 10400, price_to = NULL,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-swo-0008'; -- ゲームカードスロット不具合

-- Nintendo Switch 2
UPDATE repair_prices SET price_from = 46000, price_to = NULL,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-sw2-0003'; -- 画面割れ・液晶不良
UPDATE repair_prices SET price_from = 13000, price_to = 25000, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-sw2-0004'; -- 充電できない
UPDATE repair_prices SET price_from = 13000, price_to = 25000, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-sw2-0005'; -- 電源が入らない
UPDATE repair_prices SET price_from = 13000, price_to = NULL,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-sw2-0006'; -- バッテリー交換
UPDATE repair_prices SET price_from = 9900,  price_to = NULL,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-sw2-0007'; -- 水没修理
UPDATE repair_prices SET price_from = 19500, price_to = NULL,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'prc-sw2-0008'; -- ゲームカードスロット不具合

-- ===== 管理用料金表 (switch_repair_prices) =====
UPDATE switch_repair_prices SET price_min = 12000, price_max = NULL, is_consultation = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id IN ('m-sw-ekisho', 'm-sl-ekisho');
UPDATE switch_repair_prices SET price_min = 46000, price_max = NULL, is_consultation = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id IN ('m-s2-ekisho', 'm-s2-gamen');
UPDATE switch_repair_prices SET price_min = 8900,  price_max = NULL, is_consultation = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id IN ('m-sw-gamen', 'm-sl-gamen');
UPDATE switch_repair_prices SET price_min = 7900,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id IN ('m-sw-battery', 'm-sl-battery', 'm-sy-battery');
UPDATE switch_repair_prices SET price_min = 13000, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'm-s2-battery';
UPDATE switch_repair_prices SET price_min = 10400, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id IN ('m-sw-game', 'm-sl-game', 'm-sy-game', 'm-sy-sd');
UPDATE switch_repair_prices SET price_min = 19500, is_consultation = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'm-s2-game';
UPDATE switch_repair_prices SET price_min = 6800,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'm-sw-sd';
UPDATE switch_repair_prices SET price_min = 15500, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'm-sl-sd';
UPDATE switch_repair_prices SET price_min = 13500, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'm-s2-sd';
UPDATE switch_repair_prices SET price_min = 7000,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id IN ('m-sw-rail', 'm-sy-rail');
UPDATE switch_repair_prices SET price_min = 9300,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'm-s2-rail';
UPDATE switch_repair_prices SET price_min = 7900,  is_consultation = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'm-s2-fan';
UPDATE switch_repair_prices SET price_min = 8000,  is_consultation = 0, is_not_applicable = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id = 'm-s2-power';
UPDATE switch_repair_prices SET price_min = 2700,  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE id IN ('c-jc-stick', 'c-jc-button', 'c-jc-vibe', 'c-jc-bat', 'c-jc-rail', 'c-jc-gaiso');
