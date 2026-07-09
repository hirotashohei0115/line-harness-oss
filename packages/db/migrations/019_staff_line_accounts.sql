-- Restrict which LINE accounts (e.g. Switch) a staff account can view
ALTER TABLE staff_accounts ADD COLUMN assigned_line_accounts TEXT;
