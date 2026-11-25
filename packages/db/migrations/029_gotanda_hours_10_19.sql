-- 五反田店の営業時間を 10:00〜19:00 に変更（MacBook / Switch 共通の予約枠）
UPDATE store_hours SET open_time = '10:00', close_time = '19:00' WHERE store_key = 'gotanda';
