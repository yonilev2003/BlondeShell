-- Subscriber segments for CRM
CREATE TABLE IF NOT EXISTS subscriber_segments (
  fanvue_id TEXT PRIMARY KEY,
  segment TEXT CHECK (segment IN ('whale', 'active', 'new', 'at_risk', 'churned')),
  recommended_ppv_price INTEGER DEFAULT 10,
  onboarding_step INTEGER DEFAULT 0,
  win_back_attempts INTEGER DEFAULT 0,
  last_segment_update TIMESTAMPTZ DEFAULT NOW()
);

-- Post performance curves for learning loop
CREATE TABLE IF NOT EXISTS post_performance_curves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID,
  platform TEXT NOT NULL,
  hour_1 JSONB,
  hour_6 JSONB,
  hour_24 JSONB,
  hour_48 JSONB,
  day_7 JSONB,
  hook_type TEXT,
  visual_style TEXT,
  cta_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Storyline arcs for strategy agent
CREATE TABLE IF NOT EXISTS storyline_arcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  locations TEXT[],
  themes TEXT[],
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Annual milestones for tracking
CREATE TABLE IF NOT EXISTS annual_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  target_subs INTEGER,
  target_revenue NUMERIC,
  target_impressions BIGINT,
  actual_subs INTEGER,
  actual_revenue NUMERIC,
  actual_impressions BIGINT,
  status TEXT DEFAULT 'pending',
  UNIQUE(month, year)
);

-- Inspiration cache
CREATE TABLE IF NOT EXISTS inspiration_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url TEXT,
  platform TEXT,
  pose_description TEXT,
  outfit TEXT,
  setting TEXT,
  color_palette TEXT,
  mood TEXT,
  engagement_score NUMERIC,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  used_count INTEGER DEFAULT 0
);

-- Revenue dashboard view
CREATE OR REPLACE VIEW revenue_dashboard AS
SELECT
  DATE_TRUNC('day', created_at) as day,
  COUNT(*) as total_events,
  SUM(CASE WHEN event_type = 'subscription' THEN 1 ELSE 0 END) as new_subs,
  SUM(CASE WHEN event_type = 'dm_ppv' THEN 1 ELSE 0 END) as ppv_sales,
  created_at
FROM agent_logs
WHERE task LIKE '%revenue%'
GROUP BY DATE_TRUNC('day', created_at), created_at
ORDER BY day DESC;
