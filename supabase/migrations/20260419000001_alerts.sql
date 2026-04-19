-- Alert log table — persistent audit trail for every alert/digest dispatched.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS alert_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  level      TEXT        NOT NULL,              -- info | warn | red
  title      TEXT        NOT NULL,
  body       TEXT,
  metadata   JSONB       NOT NULL DEFAULT '{}',
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  email_ids  TEXT[]      NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_alert_log_sent_at ON alert_log (sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_log_level   ON alert_log (level);
