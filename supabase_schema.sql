-- BlondeShell Supabase Schema
-- v8.0 | 2026-03-24
-- Run once in Supabase SQL Editor → New Query → paste → Run
-- Verify: SELECT COUNT(*) FROM skill_rules; -- expect 23
--         SELECT COUNT(*) FROM substy_scripts; -- expect 11

-- ─────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('T1', 'T2', 'T3')),
  asset_url TEXT,
  face_similarity FLOAT,
  prompt_hash TEXT,
  ctr FLOAT DEFAULT 0,
  watch_time_avg FLOAT DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending_qa'
    CHECK (status IN ('pending_qa', 'approved', 'rejected', 'published', 'archived')),
  rejection_reason TEXT,
  qa_passed_at TIMESTAMPTZ,
  qa_failed_at TIMESTAMPTZ,
  subreddit TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS reference_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT UNIQUE NOT NULL,
  setting TEXT NOT NULL,
  setting_alt_description TEXT,
  tier TEXT NOT NULL CHECK (tier IN ('T1', 'T2', 'T3')),
  face_description TEXT,
  hair_color TEXT,
  hair_style TEXT,
  expression TEXT,
  skin_tone TEXT,
  outfit_type TEXT,
  outfit_description TEXT,
  body_position TEXT,
  cosine_similarity FLOAT DEFAULT 0.0,
  approved BOOLEAN DEFAULT FALSE,
  used_as_start_frame BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS video_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting TEXT NOT NULL,
  motion_type TEXT NOT NULL,
  intensity TEXT NOT NULL CHECK (intensity IN ('standard', 'premium')),
  match_phrases TEXT[],
  ppv_price INTEGER NOT NULL,
  asset_url TEXT,
  status TEXT DEFAULT 'pending_qa'
    CHECK (status IN ('pending_qa', 'approved', 'active', 'rejected', 'archived')),
  last_delivered_at TIMESTAMPTZ,
  loop_ratio_estimate FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dm_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id TEXT NOT NULL,
  intent TEXT,
  script_trigger TEXT,
  purchased BOOLEAN DEFAULT FALSE,
  ppv_price INTEGER,
  upsell_attempted BOOLEAN DEFAULT FALSE,
  upsell_converted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscribers (
  fanvue_id TEXT PRIMARY KEY,
  dm_count INTEGER DEFAULT 0,
  total_spent INTEGER DEFAULT 0,
  churn_risk TEXT DEFAULT 'GREEN' CHECK (churn_risk IN ('GREEN', 'YELLOW', 'RED')),
  acquisition_channel TEXT,
  ltv INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'churned', 'paused')),
  last_dm_opened TIMESTAMPTZ,
  re_engagement_sent_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  week_of DATE NOT NULL,
  avg_ctr FLOAT DEFAULT 0,
  avg_watch_time FLOAT DEFAULT 0,
  total_impressions INTEGER DEFAULT 0,
  score FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (platform, week_of)
);

CREATE TABLE IF NOT EXISTS agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent TEXT NOT NULL,
  task TEXT,
  status TEXT CHECK (status IN ('completed', 'partial', 'failed')),
  tokens_used INTEGER DEFAULT 0,
  rules_fired INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skill_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id TEXT UNIQUE NOT NULL,
  skill_path TEXT,
  condition TEXT,
  new_rule TEXT,
  confidence TEXT CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  verified_via TEXT,
  agent TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'archived')),
  superseded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skill_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_path TEXT NOT NULL,
  agent TEXT NOT NULL,
  relevance_score FLOAT DEFAULT 1.0,
  last_loaded_at TIMESTAMPTZ,
  UNIQUE (skill_path, agent)
);

CREATE TABLE IF NOT EXISTS ltv_by_channel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT UNIQUE NOT NULL,
  avg_ltv FLOAT DEFAULT 0,
  avg_dm_spend FLOAT DEFAULT 0,
  churn_rate FLOAT DEFAULT 0,
  subscriber_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS substy_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  trigger TEXT NOT NULL,
  text TEXT NOT NULL,
  conversion_rate FLOAT DEFAULT 0,
  status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'ab_test', 'ab_test_control', 'archived_won', 'archived_lost')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (trigger, version)
);

CREATE TABLE IF NOT EXISTS reddit_subs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_name TEXT UNIQUE NOT NULL,
  ai_allowed BOOLEAN DEFAULT TRUE,
  nsfw_tier TEXT CHECK (nsfw_tier IN ('T1', 'T2', 'none')),
  last_verified DATE,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS revenue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('subscription', 'dm_ppv', 'side_business', 'refund')),
  gross FLOAT NOT NULL,
  net_after_fanvue_20pct FLOAT GENERATED ALWAYS AS (gross * 0.80) STORED,
  channel TEXT,
  month TEXT,
  subscriber_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS context_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent TEXT NOT NULL,
  task TEXT,
  snapshot_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea TEXT NOT NULL,
  automation_score INTEGER CHECK (automation_score BETWEEN 1 AND 3),
  revenue_score INTEGER CHECK (revenue_score BETWEEN 1 AND 3),
  effort_score INTEGER CHECK (effort_score BETWEEN 1 AND 3),
  stack_fit_score INTEGER CHECK (stack_fit_score BETWEEN 1 AND 3),
  total_score INTEGER GENERATED ALWAYS AS
    (automation_score + revenue_score + effort_score + stack_fit_score) STORED,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'auto_launch', 'present_owner', 'ignored', 'launched')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- VIEWS
-- ─────────────────────────────────────────────

CREATE OR REPLACE VIEW coo_daily_snapshot AS
SELECT
  (SELECT COUNT(*) FROM subscribers WHERE created_at > NOW() - INTERVAL '24 hours') as new_subs_today,
  (SELECT COUNT(*) FROM subscribers WHERE status='active') as total_active_subs,
  (SELECT COALESCE(SUM(net_after_fanvue_20pct), 0) FROM revenue_events
   WHERE created_at > DATE_TRUNC('month', NOW())) as mtd_revenue_net,
  (SELECT COALESCE(AVG(CASE WHEN purchased THEN 1.0 ELSE 0.0 END), 0) * 100
   FROM dm_events WHERE created_at > NOW() - INTERVAL '24 hours') as dm_conversion_today,
  (SELECT COUNT(*) FROM video_library WHERE status='active') as library_size,
  (SELECT COUNT(*) FROM skill_rules WHERE status='active') as active_rules;

CREATE OR REPLACE VIEW dm_conversion_by_intent AS
SELECT
  intent,
  COUNT(*) as total_triggers,
  SUM(CASE WHEN purchased THEN 1 ELSE 0 END) as purchases,
  ROUND((AVG(CASE WHEN purchased THEN 1.0 ELSE 0.0 END) * 100)::numeric, 1) as conversion_rate,
  ROUND((AVG(CASE WHEN upsell_converted THEN 1.0 ELSE 0.0 END) * 100)::numeric, 1) as upsell_rate,
  COALESCE(AVG(CASE WHEN purchased THEN ppv_price END), 0) as avg_revenue
FROM dm_events
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY intent
ORDER BY conversion_rate DESC;

CREATE OR REPLACE VIEW platform_performance_current AS
SELECT
  platform,
  ROUND((AVG(ctr) * 100)::numeric, 2) as avg_ctr_pct,
  ROUND(AVG(watch_time_avg)::numeric, 1) as avg_watch_time,
  SUM(impressions) as total_impressions,
  COUNT(*) as posts_this_week
FROM posts
WHERE created_at > NOW() - INTERVAL '7 days'
  AND status = 'published'
GROUP BY platform
ORDER BY avg_ctr_pct DESC;

CREATE OR REPLACE VIEW active_skill_rules AS
SELECT rule_id, skill_path, condition, confidence, verified_via, created_at
FROM skill_rules
WHERE status = 'active'
ORDER BY created_at DESC;

CREATE OR REPLACE VIEW ltv_by_channel_current AS
SELECT
  acquisition_channel as channel,
  COUNT(*) as subscriber_count,
  ROUND(AVG(ltv)::numeric, 0) as avg_ltv,
  ROUND(AVG(total_spent)::numeric, 0) as avg_dm_spend,
  ROUND((AVG(CASE WHEN status='churned' THEN 1.0 ELSE 0.0 END) * 100)::numeric, 1) as churn_rate_pct
FROM subscribers
GROUP BY acquisition_channel
ORDER BY avg_ltv DESC;

CREATE OR REPLACE VIEW substy_script_performance AS
SELECT
  script_id, trigger, version, status,
  ROUND((conversion_rate * 100)::numeric, 1) as conversion_rate_pct,
  created_at
FROM substy_scripts
ORDER BY trigger, version DESC;

-- ─────────────────────────────────────────────
-- SEED DATA — 23 STARTER SKILL RULES
-- ─────────────────────────────────────────────

INSERT INTO skill_rules (rule_id, skill_path, condition, new_rule, confidence, verified_via, agent) VALUES
('R-001','skills/content/prompts.md','T1 beach prompt','Always include "candid behind-the-scenes feel, slight motion blur in hair"','MEDIUM','MindStudio methodology','coo'),
('R-002','skills/content/prompts.md','All tiers','Include 3+ anti-AI modifiers per prompt','MEDIUM','Standard practice','coo'),
('R-003','skills/content/prompts.md','T1 gym','Use action verbs (mid-squat, wiping sweat) not static poses','MEDIUM','Engagement research','coo'),
('R-004','skills/content/prompts.md','Face consistency','Reject < 0.85. LoRA retrain alert < 0.80 for 3 consecutive.','HIGH','Character consistency research','coo'),
('R-005','skills/content/prompts.md','All batches','Never repeat prompt_hash within 7 days on same platform','HIGH','Platform freshness requirements','coo'),
('R-006','skills/dm/scripts.md','New subscriber','Welcome DM within 5 min. Warm, not pushy.','HIGH','Subscriber retention research','coo'),
('R-007','skills/dm/scripts.md','After 3 exchanges','Warm-up → private content offer','HIGH','DM funnel methodology','coo'),
('R-008','skills/dm/scripts.md','Standard intent','$10 image PPV upsell','MEDIUM','Starter pricing','coo'),
('R-009','skills/dm/scripts.md','Warm intent','$15 image PPV upsell','MEDIUM','Starter pricing','coo'),
('R-010','skills/dm/scripts.md','Bold intent','$25 image PPV upsell','MEDIUM','Starter pricing','coo'),
('R-011','skills/dm/scripts.md','Video keyword','$20 (6s) / $40 (10s) video PPV','HIGH','Video PPV market rates','coo'),
('R-012','skills/dm/scripts.md','Post-purchase','Always attempt one upsell to next tier in same session','HIGH','Upsell conversion methodology','coo'),
('R-013','skills/dm/scripts.md','7 days silence','Re-engagement DM. Max 2 per cycle.','HIGH','Re-engagement best practices','coo'),
('R-014','skills/dm/scripts.md','At technical limit','Redirect warmly. Never explain limit. Offer best available.','HIGH','Retention research','coo'),
('R-015','skills/marketing/platform.md','Frequency defaults','X:4/d, Reddit:3/d, IG:2/d, TikTok:1/d, Threads:2/d, YT:1/d — hypothesis only','LOW','General social media research','coo'),
('R-016','skills/marketing/platform.md','CTR < 0.5% for 3d','Reduce 50% + new angle + COO alert','HIGH','Performance recovery methodology','coo'),
('R-017','skills/marketing/platform.md','Reddit posting','Never same sub twice/day. No repeat image in 30 days.','HIGH','Reddit platform rules','coo'),
('R-018','skills/qa/platform-rules.md','TikTok upload','AI-generated toggle MUST be ON. No exceptions.','HIGH','TikTok policy March 2026','coo'),
('R-019','skills/qa/platform-rules.md','Instagram upload','Meta AI label required. Bio must contain AI-generated.','HIGH','Meta policy March 2026','coo'),
('R-020','skills/qa/platform-rules.md','Fanvue content','Age unambiguously 21+. Reasonable person test. Doubt = reject.','HIGH','Fanvue KYC policy','coo'),
('R-021','skills/video/prompts.md','Library minimum','< 20 clips → emergency batch. < 5 → red alert.','HIGH','DM delivery SLA','coo'),
('R-022','skills/video/prompts.md','Loop matching','Match on motion_type + setting + intensity. Min 2 keyword overlap.','HIGH','DM experience research','coo'),
('R-023','skills/video/prompts.md','Batch timing','Generate at 4am PT. Never during DM peak 8pm–midnight.','HIGH','API performance research','coo')
ON CONFLICT (rule_id) DO NOTHING;

-- ─────────────────────────────────────────────
-- SEED DATA — 11 SUBSTY SCRIPTS
-- ─────────────────────────────────────────────

INSERT INTO substy_scripts (script_id, version, trigger, text, status) VALUES
('S-001', 1, 'welcome', 'Hey! So happy you''re here. I post my best stuff here — gym, beach, things I don''t share anywhere else. Feel free to DM me anytime, I actually reply.', 'active'),
('S-002', 1, 'warmup', 'You''ve been so sweet in my messages, I feel like I actually know you a little. I have some content I only share privately — want me to send you something?', 'active'),
('S-003', 1, 'ppv_standard', 'I put together something special — exclusive here. I''ll send it over for $10.', 'active'),
('S-004', 1, 'ppv_warm', 'Okay you''ve been amazing to talk to. I saved something just for special people — $15 and it''s yours.', 'active'),
('S-005', 1, 'ppv_bold', 'Oh you want something more daring? I do have something... $25 for the really good stuff.', 'active'),
('S-006', 1, 'video_standard', 'I actually have a clip for that. 6 seconds of [setting] — $20.', 'active'),
('S-007', 1, 'video_premium', 'A 10-second one that''s really something. $40 — worth every second.', 'active'),
('S-008', 1, 'upsell_post_purchase', 'Glad you liked it. I have something a level up from that... want to see? [next tier]', 'active'),
('S-009', 1, 'quality_deepening', 'You clearly have good taste. The best stuff I have is [higher tier] — it''s a different level.', 'active'),
('S-010', 1, 're_engagement', 'Hey, haven''t heard from you in a bit. I just posted something I think you''d really like. How have you been?', 'active'),
('S-011', 1, 'refusal', 'Haha that''s a little outside what I share here — the tools I use have their limits! But trust me what I have is great — want me to send you something you''ll love?', 'active')
ON CONFLICT (trigger, version) DO NOTHING;

-- ─────────────────────────────────────────────
-- SEED DATA — SKILL SCORES
-- ─────────────────────────────────────────────

INSERT INTO skill_scores (skill_path, agent, relevance_score) VALUES
('skills/content/prompts.md', 'content', 1.0),
('skills/content/prompts.md', 'qa', 0.8),
('skills/dm/scripts.md', 'dm', 1.0),
('skills/dm/scripts.md', 'coo', 0.7),
('skills/marketing/platform.md', 'marketing', 1.0),
('skills/marketing/platform.md', 'coo', 0.7),
('skills/qa/platform-rules.md', 'qa', 1.0),
('skills/qa/platform-rules.md', 'content', 0.9),
('skills/video/prompts.md', 'video', 1.0),
('skills/video/prompts.md', 'content', 0.7)
ON CONFLICT (skill_path, agent) DO NOTHING;

-- ─────────────────────────────────────────────
-- SEED DATA — REDDIT APPROVED SUBS
-- ─────────────────────────────────────────────

INSERT INTO reddit_subs (sub_name, ai_allowed, nsfw_tier, last_verified) VALUES
('r/aiArt', true, 'T1', '2026-03-24'),
('r/AIpics', true, 'T1', '2026-03-24'),
('r/StableDiffusion', true, 'T1', '2026-03-24'),
('r/MediaSynthesis', true, 'T2', '2026-03-24'),
('r/SFWNextDoorGirls', true, 'T2', '2026-03-24'),
('r/Swimwear', true, 'T2', '2026-03-24')
ON CONFLICT (sub_name) DO NOTHING;

-- ─────────────────────────────────────────────
-- VERIFICATION QUERIES (run after seed)
-- ─────────────────────────────────────────────

-- SELECT COUNT(*) FROM skill_rules;    -- expect 23
-- SELECT COUNT(*) FROM substy_scripts; -- expect 11
-- SELECT COUNT(*) FROM skill_scores;   -- expect 10
-- SELECT COUNT(*) FROM reddit_subs;    -- expect 6