-- Update MacBook screen repair (画面割れ・液晶不良) prices per updated Lstep price sheet (2026-08-17)

-- 16インチ
UPDATE repair_model_prices SET price = 67400, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2991' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 67400, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2780' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 67400, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2485' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 81100, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2141' AND symptom = '画面割れ・液晶不良';

-- 15インチ
UPDATE repair_model_prices SET price = 25000, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3241' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 53000, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3114' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 53000, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2941' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 72500, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A1990' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 67800, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A1707' AND symptom = '画面割れ・液晶不良';

-- 14インチ
UPDATE repair_model_prices SET price = 25000, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3434' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 61200, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3401' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 61200, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3112' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 61200, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3185' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 61200, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2779' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 61200, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2992' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 61200, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2918' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 61200, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2442' AND symptom = '画面割れ・液晶不良';

-- 13インチ
UPDATE repair_model_prices SET price = 50500, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3240' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 51300, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3113' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 50500, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2681' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 47300, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2338' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 51400, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2289' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 51400, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2251' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 46600, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2337' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 46600, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2179' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 47600, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2159' AND symptom = '画面割れ・液晶不良';
-- A1932: sheet listed both "2019 Air ¥49,600" and "2018 Air ¥48,700" for this model number; confirmed with requester to use ¥49,600 (only one price per model_number in this table)
UPDATE repair_model_prices SET price = 49600, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A1932' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 48100, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A1989' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 43700, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A1708' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 43700, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A1706' AND symptom = '画面割れ・液晶不良';
