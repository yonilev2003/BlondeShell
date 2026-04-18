-- v5.2 A/B Testing tables

CREATE TABLE IF NOT EXISTS ab_test_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID,
  platform        TEXT NOT NULL,
  variations      JSONB NOT NULL DEFAULT '[]',
  winner_id       TEXT,
  status          TEXT NOT NULL DEFAULT 'running', -- running | complete | expired
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_test_groups_content ON ab_test_groups (content_item_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_groups_status  ON ab_test_groups (status);
CREATE INDEX IF NOT EXISTS idx_ab_test_groups_created ON ab_test_groups (created_at DESC);

-- Hook performance: one row per variation post, updated when analytics come in
CREATE TABLE IF NOT EXISTS hook_performance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         TEXT NOT NULL,
  hook_text       TEXT NOT NULL,
  hook_type       TEXT NOT NULL DEFAULT 'unknown',  -- curiosity_gap | pov_identity | direct_cta | vulnerability | humor | trend_hijack
  platform        TEXT NOT NULL,
  impressions_2h  INTEGER NOT NULL DEFAULT 0,
  engagement_2h   INTEGER NOT NULL DEFAULT 0,
  ctr             NUMERIC(6, 4) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hook_performance_platform   ON hook_performance (platform);
CREATE INDEX IF NOT EXISTS idx_hook_performance_engagement ON hook_performance (engagement_2h DESC);
CREATE INDEX IF NOT EXISTS idx_hook_performance_post       ON hook_performance (post_id);
