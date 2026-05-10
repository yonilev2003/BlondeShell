-- BlondeShell v3.1 hybrid migration
-- Adds: personas (multi-persona), bandit_state (Thompson sampling), agent_memory (versioned + rollback),
-- approval_queue (12h timeout), asset_archive (R2 mirror), backup_accounts (warming pool),
-- chargebacks, pricing_state, performance_scores (peer-normalized), metrics_snapshots (multi-window).
-- Idempotent. Apply via Supabase SQL Editor (per Apr 18 lesson on migration drift, do not use db push).

-- =========================================================================
-- PERSONAS — multi-persona ready, single active row for blondshell today
-- =========================================================================
CREATE TABLE IF NOT EXISTS personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_name TEXT UNIQUE NOT NULL,
  persona_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  identity JSONB NOT NULL DEFAULT '{}',
  visual JSONB NOT NULL DEFAULT '{}',
  personality JSONB NOT NULL DEFAULT '{}',
  voice_clone_id TEXT,
  lora_model_id TEXT,
  kyc_status TEXT DEFAULT 'personal',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO personas (system_name, persona_name, status, identity, visual, personality)
VALUES (
  'blondshell',
  'Blond Shell',
  'active',
  jsonb_build_object(
    'first_name', 'Blond',
    'last_name', 'Shell',
    'dob', '2004-06-01',
    'location', 'Los Angeles, California',
    'timezone', 'America/Los_Angeles',
    'handles', jsonb_build_object(
      'ig', 'imtheblondeshell',
      'tt', 'itstheblondeshell',
      'x', 'TBD_post_rebuild',
      'fanvue', 'blondeshell',
      'beacons', 'blondeshell'
    )
  ),
  jsonb_build_object(
    'hair_color', 'platinum blond',
    'eye_color', 'green',
    'build', 'slim athletic',
    'skin_tone', 'tan',
    'features', 'light freckles',
    'no_tattoos', true,
    'no_piercings', true
  ),
  jsonb_build_object(
    'voice_one_liner', 'Wholesome but cheeky. Self-aware AI quips. Gym bro humor. Calls fans pixels. Says gg unironically.',
    'tagline', '100% AI, 100% me'
  )
)
ON CONFLICT (system_name) DO NOTHING;

-- =========================================================================
-- BANDIT_STATE — Thompson sampling on Beta(alpha, beta)
-- =========================================================================
CREATE TABLE IF NOT EXISTS bandit_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID REFERENCES personas(id),
  lever_name TEXT NOT NULL,
  arm_id TEXT NOT NULL,
  arm_metadata JSONB,
  alpha FLOAT DEFAULT 1.0,
  beta FLOAT DEFAULT 1.0,
  n_pulls INT DEFAULT 0,
  cumulative_reward FLOAT DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(persona_id, lever_name, arm_id)
);
CREATE INDEX IF NOT EXISTS idx_bandit_lever ON bandit_state(persona_id, lever_name);

-- =========================================================================
-- AGENT_MEMORY — versioned with auto-rollback support
-- =========================================================================
CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID REFERENCES personas(id),
  agent_name TEXT NOT NULL,
  version INT NOT NULL,
  core_prompt TEXT,
  learnings JSONB DEFAULT '[]',
  do_not_repeat JSONB DEFAULT '[]',
  performance_score FLOAT,
  deployed_at TIMESTAMPTZ DEFAULT NOW(),
  superseded_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  UNIQUE(persona_id, agent_name, version)
);
CREATE INDEX IF NOT EXISTS idx_agent_memory_active ON agent_memory(persona_id, agent_name, status) WHERE status = 'active';

-- =========================================================================
-- APPROVAL_QUEUE — 12h timeout, default-to-queue (NOT auto-publish)
-- =========================================================================
CREATE TABLE IF NOT EXISTS approval_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID,
  persona_id UUID REFERENCES personas(id),
  preview_image_url TEXT,
  preview_caption TEXT,
  preview_hooks JSONB,
  sent_at TIMESTAMPTZ,
  decision TEXT,
  decision_at TIMESTAMPTZ,
  rejection_reason TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approval_pending ON approval_queue(decision) WHERE decision IS NULL;
CREATE INDEX IF NOT EXISTS idx_approval_expires ON approval_queue(expires_at) WHERE decision IS NULL;

-- =========================================================================
-- ASSET_ARCHIVE — Cloudflare R2 mirror tracking
-- =========================================================================
CREATE TABLE IF NOT EXISTS asset_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID REFERENCES personas(id),
  content_item_id UUID,
  supabase_path TEXT,
  r2_path TEXT,
  asset_type TEXT,
  hash TEXT,
  size_bytes BIGINT,
  archived_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asset_archive_content ON asset_archive(content_item_id);

-- =========================================================================
-- BACKUP_ACCOUNTS — warming pool (2 IG, 2 TT, 1 X), warming clock starts Day 1
-- =========================================================================
CREATE TABLE IF NOT EXISTS backup_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID REFERENCES personas(id),
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  status TEXT DEFAULT 'warming',
  warming_started_at TIMESTAMPTZ,
  device_id TEXT,
  ip_pool TEXT,
  email TEXT,
  current_followers INT DEFAULT 0,
  last_post_at TIMESTAMPTZ,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_backup_status ON backup_accounts(persona_id, status);

-- =========================================================================
-- CHARGEBACKS — Fanvue refunds + Substy disputes
-- =========================================================================
CREATE TABLE IF NOT EXISTS chargebacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID REFERENCES personas(id),
  fan_id UUID,
  transaction_id TEXT,
  amount FLOAT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  fee FLOAT DEFAULT 0,
  evidence JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_chargebacks_persona_status ON chargebacks(persona_id, status);

-- =========================================================================
-- PRICING_STATE — dynamic pricing control loop (Loop Optimizer monthly)
-- =========================================================================
CREATE TABLE IF NOT EXISTS pricing_state (
  persona_id UUID PRIMARY KEY REFERENCES personas(id),
  current_sub_price FLOAT DEFAULT 10.0,
  current_ppv_standard FLOAT DEFAULT 10.0,
  current_ppv_premium FLOAT DEFAULT 18.0,
  current_ppv_personalized FLOAT DEFAULT 30.0,
  last_ppv_ratio FLOAT,
  last_adjusted_at TIMESTAMPTZ,
  adjustment_history JSONB DEFAULT '[]'
);

INSERT INTO pricing_state (persona_id)
SELECT id FROM personas WHERE system_name = 'blondshell'
ON CONFLICT (persona_id) DO NOTHING;

-- =========================================================================
-- PERFORMANCE_SCORES — peer-normalized vs last 30 same-platform posts
-- =========================================================================
CREATE TABLE IF NOT EXISTS performance_scores (
  content_item_id UUID PRIMARY KEY,
  raw_score FLOAT,
  peer_normalized_score FLOAT,
  percentile_rank FLOAT,
  velocity_1h FLOAT,
  velocity_6h FLOAT,
  conversion_score FLOAT,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  computed_with_n_snapshots INT
);

-- =========================================================================
-- METRICS_SNAPSHOTS — multi-window (1h, 6h, 24h, 72h, 7d)
-- =========================================================================
CREATE TABLE IF NOT EXISTS metrics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID,
  snapshot_at TIMESTAMPTZ NOT NULL,
  hours_since_post FLOAT NOT NULL,
  views INT,
  likes INT,
  comments INT,
  saves INT,
  shares INT,
  click_through_to_fanvue INT,
  follower_delta INT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_metrics_content ON metrics_snapshots(content_item_id);
CREATE INDEX IF NOT EXISTS idx_metrics_snapshot_at ON metrics_snapshots(snapshot_at);

-- =========================================================================
-- MULTI-PERSONA AWARENESS — additive columns on existing tables
-- =========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'content_items') THEN
    ALTER TABLE content_items ADD COLUMN IF NOT EXISTS persona_id UUID REFERENCES personas(id);
    UPDATE content_items
    SET persona_id = (SELECT id FROM personas WHERE system_name = 'blondshell')
    WHERE persona_id IS NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscribers') THEN
    ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS persona_id UUID REFERENCES personas(id);
    ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS rfm_recency INT;
    ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS rfm_frequency INT;
    ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS rfm_monetary FLOAT;
    ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS segment TEXT;
    UPDATE subscribers
    SET persona_id = (SELECT id FROM personas WHERE system_name = 'blondshell')
    WHERE persona_id IS NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'revenue_events') THEN
    ALTER TABLE revenue_events ADD COLUMN IF NOT EXISTS persona_id UUID REFERENCES personas(id);
    UPDATE revenue_events
    SET persona_id = (SELECT id FROM personas WHERE system_name = 'blondshell')
    WHERE persona_id IS NULL;
  END IF;
END $$;

-- =========================================================================
-- BANDIT COLD-START SEED — uniform Beta(1,1) for first arm of each lever
-- (Real arm enumeration happens in lib/bandits.js on first selectArm() call.)
-- =========================================================================
INSERT INTO bandit_state (persona_id, lever_name, arm_id, arm_metadata, alpha, beta)
SELECT
  p.id,
  lever,
  'cold_start',
  jsonb_build_object('seeded_at', NOW(), 'note', 'Replaced by real arms on first selectArm()'),
  1.0, 1.0
FROM personas p
CROSS JOIN (VALUES ('post_time'), ('hook_style'), ('content_category'), ('voice_emotion'), ('visual_aesthetic')) AS l(lever)
WHERE p.system_name = 'blondshell'
ON CONFLICT (persona_id, lever_name, arm_id) DO NOTHING;
