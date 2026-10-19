-- type is app-defined data now. 'other' was the implicit default, so only explicit values move into extra.type.
INSERT OR IGNORE INTO feedback_extra (path, value, feedback_id)
SELECT 'type', json_quote(type), id FROM feedback
  WHERE type != 'other' AND json_type(extra, '$.type') IS NULL;

UPDATE feedback SET extra = json_set(extra, '$.type', type) WHERE type != 'other' AND json_type(extra, '$.type') IS NULL;

DROP INDEX idx_feedback_app_type;
ALTER TABLE feedback DROP COLUMN type;
