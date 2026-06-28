-- Add line_account_id to notification_rules for per-account scoping
ALTER TABLE notification_rules ADD COLUMN line_account_id TEXT;

-- Add line_account_id to cross_analysis_definitions for per-account scoping
ALTER TABLE cross_analysis_definitions ADD COLUMN line_account_id TEXT;

-- Add line_account_id to notifications log (inherited from rule)
ALTER TABLE notifications ADD COLUMN line_account_id TEXT;
