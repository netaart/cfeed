-- contact, user_id, rating, app_version, page_url are app-defined data now: move non-null values into
-- extra (unless extra already has that key), index them like any other extra leaf, then drop the columns.
INSERT OR IGNORE INTO feedback_extra (path, value, feedback_id)
SELECT 'contact', json_quote(contact), id FROM feedback
  WHERE contact IS NOT NULL AND json_type(extra, '$.contact') IS NULL AND length(json_quote(contact)) <= 256
UNION ALL
SELECT 'user_id', json_quote(user_id), id FROM feedback
  WHERE user_id IS NOT NULL AND json_type(extra, '$.user_id') IS NULL AND length(json_quote(user_id)) <= 256
UNION ALL
SELECT 'rating', CAST(rating AS TEXT), id FROM feedback
  WHERE rating IS NOT NULL AND json_type(extra, '$.rating') IS NULL
UNION ALL
SELECT 'app_version', json_quote(app_version), id FROM feedback
  WHERE app_version IS NOT NULL AND json_type(extra, '$.app_version') IS NULL
UNION ALL
SELECT 'page_url', json_quote(page_url), id FROM feedback
  WHERE page_url IS NOT NULL AND json_type(extra, '$.page_url') IS NULL AND length(json_quote(page_url)) <= 256;

UPDATE feedback SET extra = json_set(extra, '$.contact', contact) WHERE contact IS NOT NULL AND json_type(extra, '$.contact') IS NULL;
UPDATE feedback SET extra = json_set(extra, '$.user_id', user_id) WHERE user_id IS NOT NULL AND json_type(extra, '$.user_id') IS NULL;
UPDATE feedback SET extra = json_set(extra, '$.rating', rating) WHERE rating IS NOT NULL AND json_type(extra, '$.rating') IS NULL;
UPDATE feedback SET extra = json_set(extra, '$.app_version', app_version) WHERE app_version IS NOT NULL AND json_type(extra, '$.app_version') IS NULL;
UPDATE feedback SET extra = json_set(extra, '$.page_url', page_url) WHERE page_url IS NOT NULL AND json_type(extra, '$.page_url') IS NULL;

DROP INDEX idx_feedback_app_user;
ALTER TABLE feedback DROP COLUMN contact;
ALTER TABLE feedback DROP COLUMN user_id;
ALTER TABLE feedback DROP COLUMN rating;
ALTER TABLE feedback DROP COLUMN app_version;
ALTER TABLE feedback DROP COLUMN page_url;
