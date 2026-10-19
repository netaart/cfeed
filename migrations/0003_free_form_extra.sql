-- extra is free-form now; per-app field declarations are gone.
ALTER TABLE apps DROP COLUMN fields;
ALTER TABLE apps DROP COLUMN strict_fields;

-- Inverted index over extra: one row per scalar leaf, at most 5 path segments. Scalar array elements
-- share their parent's path, so x.tags=a means "tags contains a"; objects inside arrays are not indexed. value is the JSON text of the scalar ("1.4.2" quoted, 3, true).
CREATE TABLE feedback_extra (
  path         TEXT NOT NULL,
  value        TEXT NOT NULL,
  feedback_id  TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  PRIMARY KEY (path, value, feedback_id)
) WITHOUT ROWID;

CREATE INDEX idx_feedback_extra_feedback ON feedback_extra (feedback_id);

INSERT OR IGNORE INTO feedback_extra (path, value, feedback_id)
SELECT p, v, id FROM (
  SELECT f.id,
         substr(CASE WHEN typeof(t.key) = 'integer' THEN t.path ELSE t.fullkey END, 3) AS p,
         CASE t.type
           WHEN 'text' THEN json_quote(t.value)
           WHEN 'true' THEN 'true'
           WHEN 'false' THEN 'false'
           WHEN 'null' THEN 'null'
           ELSE CAST(t.value AS TEXT)
         END AS v
  FROM feedback f, json_tree(f.extra) t
  WHERE t.type NOT IN ('object', 'array')
)
WHERE p != '' AND instr(p, '[') = 0 AND instr(p, '"') = 0 AND length(v) <= 256
  AND length(p) - length(replace(p, '.', '')) < 5;
