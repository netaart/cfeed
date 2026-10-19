-- Optional per-app config. Unregistered apps still accept feedback using global defaults.
CREATE TABLE apps (
  slug             TEXT PRIMARY KEY,
  name             TEXT,
  allowed_origins  TEXT NOT NULL DEFAULT '[]',    -- JSON array; empty = any origin
  fields           TEXT NOT NULL DEFAULT '[]',
  strict_fields    INTEGER NOT NULL DEFAULT 0,    -- 1 = reject undeclared extra fields
  max_files        INTEGER,                       -- NULL = global default
  max_file_bytes   INTEGER,
  allowed_mime     TEXT,                          -- JSON array; NULL = global default
  retention_days   INTEGER,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE api_keys (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  key_hash      TEXT NOT NULL UNIQUE,             -- SHA-256 of the plaintext, which is returned only once at creation
  key_prefix    TEXT NOT NULL,
  app           TEXT,                             -- NULL = all apps; otherwise pinned to this app
  scope         TEXT NOT NULL DEFAULT 'read' CHECK (scope IN ('read', 'write')),
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER,
  revoked_at    INTEGER
);

CREATE TABLE feedback (
  id                 TEXT PRIMARY KEY,
  app                TEXT NOT NULL DEFAULT 'default',  -- no FK: unregistered apps can receive feedback
  type               TEXT NOT NULL DEFAULT 'other',
  content            TEXT NOT NULL,
  contact            TEXT,
  rating             INTEGER CHECK (rating BETWEEN 1 AND 5),
  user_id            TEXT,
  page_url           TEXT,
  app_version        TEXT,
  status             TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'spam')),
  tags               TEXT NOT NULL DEFAULT '[]',
  extra              TEXT NOT NULL DEFAULT '{}',
  note               TEXT,
  -- Captured server-side from the request; clients cannot set these columns
  ua                 TEXT,
  ua_browser         TEXT,
  ua_browser_version TEXT,
  ua_os              TEXT,
  ua_os_version      TEXT,
  ua_device          TEXT,
  client_hints       TEXT,
  ip_hash            TEXT,                        -- HMAC(IP_SALT, ip); the raw IP is never stored
  country            TEXT,
  region             TEXT,
  city               TEXT,
  timezone           TEXT,
  asn                INTEGER,
  colo               TEXT,
  language           TEXT,
  referer            TEXT,
  origin             TEXT,
  attachment_count   INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE INDEX idx_feedback_app_created ON feedback (app, created_at DESC, id DESC);
CREATE INDEX idx_feedback_app_status  ON feedback (app, status, created_at DESC);
CREATE INDEX idx_feedback_app_type    ON feedback (app, type, created_at DESC);
CREATE INDEX idx_feedback_app_user    ON feedback (app, user_id);
CREATE INDEX idx_feedback_created     ON feedback (created_at DESC, id DESC);

CREATE TABLE attachments (
  id            TEXT PRIMARY KEY,
  feedback_id   TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  r2_key        TEXT NOT NULL UNIQUE,
  filename      TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  size          INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE INDEX idx_attachments_feedback ON attachments (feedback_id);
