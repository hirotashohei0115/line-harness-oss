-- Record terms-of-service/privacy-policy consent given on mail-in repair forms
ALTER TABLE mail_orders ADD COLUMN terms_agreed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mail_orders ADD COLUMN terms_agreed_at TEXT;
