-- Per-account welcome message for accounts with no automated bot flow (see isGenericAccount in webhook.ts)
ALTER TABLE line_accounts ADD COLUMN welcome_text TEXT;
