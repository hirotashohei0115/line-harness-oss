-- Migration 017: Add line_account_id to remaining tables for per-account scoping
ALTER TABLE funnel_definitions ADD COLUMN line_account_id TEXT;
ALTER TABLE scoring_rules ADD COLUMN line_account_id TEXT;
ALTER TABLE incoming_webhooks ADD COLUMN line_account_id TEXT;
ALTER TABLE outgoing_webhooks ADD COLUMN line_account_id TEXT;
