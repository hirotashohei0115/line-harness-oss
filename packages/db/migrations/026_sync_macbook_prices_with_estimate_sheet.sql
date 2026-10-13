-- Sync MacBook LINE quote prices with the 概算費用 sheet of the 「Macbook　電話見積」 spreadsheet (2026-10-13)

-- 画面割れ・液晶不良 ← LCD交換
-- 16インチ
UPDATE repair_model_prices SET price = 82800, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2991' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 82800, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2780' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 82800, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2485' AND symptom = '画面割れ・液晶不良';
-- 15インチ
UPDATE repair_model_prices SET price = 52700, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3241' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 54200, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3114' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 54200, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2941' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 65100, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A1990' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 71900, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A1707' AND symptom = '画面割れ・液晶不良';
-- 13インチ
UPDATE repair_model_prices SET price = 53800, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3240' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 55700, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2289' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 55700, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2251' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 52800, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2179' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 55700, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2159' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 58000, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A1932' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 54600, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A1989' AND symptom = '画面割れ・液晶不良';

-- バッテリー劣化 ← バッテリー交換 提示料金
-- 16インチ
UPDATE repair_model_prices SET price = 29500, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2991' AND symptom = 'バッテリー劣化';
UPDATE repair_model_prices SET price = 23200, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2485' AND symptom = 'バッテリー劣化';
-- 15インチ
UPDATE repair_model_prices SET price = 20200, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3114' AND symptom = 'バッテリー劣化';
UPDATE repair_model_prices SET price = 20200, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2941' AND symptom = 'バッテリー劣化';
UPDATE repair_model_prices SET price = 21200, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A1707' AND symptom = 'バッテリー劣化';
-- 14インチ
UPDATE repair_model_prices SET price = 25100, delivery_days = '3〜7日', updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3401' AND symptom = 'バッテリー劣化';
UPDATE repair_model_prices SET price = 25100, delivery_days = '3〜7日', updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3112' AND symptom = 'バッテリー劣化';
UPDATE repair_model_prices SET price = 25100, delivery_days = '3〜7日', updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3185' AND symptom = 'バッテリー劣化';
UPDATE repair_model_prices SET price = 25000, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2779' AND symptom = 'バッテリー劣化';
UPDATE repair_model_prices SET price = 25000, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2992' AND symptom = 'バッテリー劣化';
UPDATE repair_model_prices SET price = 25000, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2918' AND symptom = 'バッテリー劣化';
-- 13インチ
UPDATE repair_model_prices SET price = 23400, delivery_days = '3〜7日', updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3240' AND symptom = 'バッテリー劣化';
UPDATE repair_model_prices SET price = 23800, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3113' AND symptom = 'バッテリー劣化';
UPDATE repair_model_prices SET price = 18200, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2681' AND symptom = 'バッテリー劣化';
UPDATE repair_model_prices SET price = 21000, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A1706' AND symptom = 'バッテリー劣化';

-- 充電できない (シートに該当行なし。従来どおりバッテリー劣化と同額に揃える)
-- 16インチ
UPDATE repair_model_prices SET price = 29500, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2991' AND symptom = '充電できない';
UPDATE repair_model_prices SET price = 23200, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2485' AND symptom = '充電できない';
-- 15インチ
UPDATE repair_model_prices SET price = 20200, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3114' AND symptom = '充電できない';
UPDATE repair_model_prices SET price = 20200, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2941' AND symptom = '充電できない';
UPDATE repair_model_prices SET price = 21200, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A1707' AND symptom = '充電できない';
-- 14インチ
UPDATE repair_model_prices SET price = 25100, delivery_days = '3〜7日', updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3401' AND symptom = '充電できない';
UPDATE repair_model_prices SET price = 25100, delivery_days = '3〜7日', updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3112' AND symptom = '充電できない';
UPDATE repair_model_prices SET price = 25100, delivery_days = '3〜7日', updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3185' AND symptom = '充電できない';
UPDATE repair_model_prices SET price = 25000, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2779' AND symptom = '充電できない';
UPDATE repair_model_prices SET price = 25000, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2992' AND symptom = '充電できない';
UPDATE repair_model_prices SET price = 25000, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2918' AND symptom = '充電できない';
-- 13インチ
UPDATE repair_model_prices SET price = 23400, delivery_days = '3〜7日', updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3240' AND symptom = '充電できない';
UPDATE repair_model_prices SET price = 23800, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3113' AND symptom = '充電できない';
UPDATE repair_model_prices SET price = 18200, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2681' AND symptom = '充電できない';
UPDATE repair_model_prices SET price = 21000, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A1706' AND symptom = '充電できない';

-- キーボード故障 ← キーボード交換 提示料金
-- 13インチ
UPDATE repair_model_prices SET price = 25100, delivery_days = '1週間', updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3240' AND symptom = 'キーボード故障';
