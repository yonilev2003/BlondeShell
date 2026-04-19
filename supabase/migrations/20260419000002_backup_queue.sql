-- Backup content queue — 7-day safety buffer for autonomous publishing.
-- If the daily pipeline fails (fal.ai / Publer / QA), the hourly
-- backup_check_agent pulls pre-approved items from here and schedules them
-- so the feed never goes silent.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS backup_content_queue (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  media_url   TEXT        NOT NULL,
  captions    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  tier        TEXT,
  priority    INTEGER     NOT NULL DEFAULT 0,
  used        BOOLEAN     NOT NULL DEFAULT FALSE,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary read path: dequeueOldest filters by used=false, tier, orders by priority desc
CREATE INDEX IF NOT EXISTS idx_backup_queue_unused
  ON backup_content_queue (used, tier, priority DESC, created_at ASC);

-- Secondary: refillFromApproved dedupes against media_url
CREATE INDEX IF NOT EXISTS idx_backup_queue_media_url
  ON backup_content_queue (media_url);
