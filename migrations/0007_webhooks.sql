-- Per-app webhook fired after every accepted submission; last_* record the most recent delivery.
ALTER TABLE apps ADD COLUMN webhook_url TEXT;
ALTER TABLE apps ADD COLUMN webhook_secret TEXT;
ALTER TABLE apps ADD COLUMN webhook_last_at INTEGER;
ALTER TABLE apps ADD COLUMN webhook_last_status INTEGER;
ALTER TABLE apps ADD COLUMN webhook_last_error TEXT;
