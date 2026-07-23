-- Fix: replace old MacBook LIFF ID (2010126656-iMP2b4Jw) with correct ID (2007974811-LpVxs3kg)
-- Background: commit cbe5ff5 changed the default LIFF ID but templates stored in DB still reference the old one.
UPDATE templates
SET message_content = REPLACE(message_content, '2010126656-iMP2b4Jw', '2007974811-LpVxs3kg')
WHERE message_content LIKE '%2010126656-iMP2b4Jw%';
