-- Allowlist entries become hostnames ("a.com", "*.a.com"): strip scheme and port from stored origins.
UPDATE apps SET allowed_origins = (
  SELECT json_group_array(CASE WHEN instr(h, ':') > 0 THEN substr(h, 1, instr(h, ':') - 1) ELSE h END)
  FROM (SELECT lower(replace(replace(value, 'https://', ''), 'http://', '')) AS h FROM json_each(apps.allowed_origins))
);
ALTER TABLE apps RENAME COLUMN allowed_origins TO allowed_domains;

-- Retention was never enforced.
ALTER TABLE apps DROP COLUMN retention_days;
