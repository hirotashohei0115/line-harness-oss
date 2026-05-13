-- Add is_read column to messages_log for unread badge tracking
-- Default 1 (= read) so existing messages don't appear as unread
ALTER TABLE messages_log ADD COLUMN is_read INTEGER NOT NULL DEFAULT 1;
