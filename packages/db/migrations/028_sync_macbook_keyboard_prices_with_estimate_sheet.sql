-- Sync MacBook LINE keyboard (キーボード故障) prices with the キーボード交換 block of the 概算費用 sheet (2026-11-11)
-- A1708 has one row (year 2019), so it uses the sheet's 2019 price; it was consultation-only before.

UPDATE repair_model_prices SET price = 35600, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A3114' AND symptom = 'キーボード故障';
UPDATE repair_model_prices SET price = 35600, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A2941' AND symptom = 'キーボード故障';
UPDATE repair_model_prices SET price = 33300, delivery_days = '1週間', updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE model_number = 'A1708' AND symptom = 'キーボード故障';
