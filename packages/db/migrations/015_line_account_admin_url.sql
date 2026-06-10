-- Add admin_url to line_accounts for cross-dashboard navigation
ALTER TABLE line_accounts ADD COLUMN admin_url TEXT;
