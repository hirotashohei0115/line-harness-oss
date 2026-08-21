-- Update SwitchMaster (Nintendo Switch repair) LINE auto-reply contact phone number to 050-3202-2843

UPDATE switch_settings SET value = REPLACE(value, '070-1391-9861', '050-3202-2843'), updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE key = 'consult_phone_text';
UPDATE switch_settings SET value = REPLACE(value, '070-1271-7186', '050-3202-2843'), updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours') WHERE key = 'welcome_text';
