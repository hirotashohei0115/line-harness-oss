-- Sync MacBook LINE screen (画面割れ・液晶不良) prices with the LCD交換 column of the 概算費用 sheet (2026-11-11)
-- Blank cells in the sheet (A2141, A3434) become NULL = consultation-only.

UPDATE repair_model_prices SET price = 76600, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2991' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 76600, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2780' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 76600, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2485' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2141' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 47900, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3241' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 47900, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3114' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 47900, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2941' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3434' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 50500, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3240' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 39800, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2338' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 45700, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2289' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 39800, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2251' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 39800, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2337' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 39800, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2179' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 45700, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2159' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 48000, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A1932' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 44600, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A1989' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 39800, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A1708' AND symptom = '画面割れ・液晶不良';
UPDATE repair_model_prices SET price = 39800, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A1706' AND symptom = '画面割れ・液晶不良';
