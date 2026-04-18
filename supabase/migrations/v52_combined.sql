-- ============================================================================
-- v5.2 Combined Migration — paste into Supabase SQL Editor
-- Idempotent: safe to re-run. Use this instead of `supabase db push` if
-- local/remote migration history is out of sync.
-- ============================================================================

-- ─── A/B Testing tables ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ab_test_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID,
  platform        TEXT NOT NULL,
  variations      JSONB NOT NULL DEFAULT '[]',
  winner_id       TEXT,
  status          TEXT NOT NULL DEFAULT 'running',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_test_groups_content ON ab_test_groups (content_item_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_groups_status  ON ab_test_groups (status);
CREATE INDEX IF NOT EXISTS idx_ab_test_groups_created ON ab_test_groups (created_at DESC);

CREATE TABLE IF NOT EXISTS hook_performance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         TEXT NOT NULL,
  hook_text       TEXT NOT NULL,
  hook_type       TEXT NOT NULL DEFAULT 'unknown',
  platform        TEXT NOT NULL,
  impressions_2h  INTEGER NOT NULL DEFAULT 0,
  engagement_2h   INTEGER NOT NULL DEFAULT 0,
  ctr             NUMERIC(6, 4) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hook_performance_platform   ON hook_performance (platform);
CREATE INDEX IF NOT EXISTS idx_hook_performance_engagement ON hook_performance (engagement_2h DESC);
CREATE INDEX IF NOT EXISTS idx_hook_performance_post       ON hook_performance (post_id);

-- ─── Brand Arc #1 seed ──────────────────────────────────────────────────────
-- Requires storyline_arcs + annual_milestones from v51 migration.
-- If those tables don't exist, run 20260417000001_v51_tables.sql first.

INSERT INTO storyline_arcs (
  name, description, start_date, end_date, locations, themes, status
)
SELECT
  'LA Arrival — The Fresh Start',
  'BlondeShell just moved to LA from a small town. Everything is new: the apartment, the gym, the beach, the nightlife. This arc documents her settling-in era: exploring Santa Monica, trying new pilates studios, furnishing her place, first LA friendships, and discovering her LA aesthetic. Mix of excitement, occasional homesickness, and manifesting the dream life. Authentic "fresh-off-the-plane" Gen Z energy.',
  '2026-04-24'::DATE,
  '2026-05-24'::DATE,
  ARRAY['santa_monica', 'west_hollywood', 'melrose', 'venice_beach', 'pilates_studio', 'new_apartment'],
  ARRAY['fresh_start', 'apartment_setup', 'beach_exploration', 'fitness_journey', 'solo_era', 'california_dream', 'making_friends'],
  'active'
WHERE NOT EXISTS (SELECT 1 FROM storyline_arcs WHERE name = 'LA Arrival — The Fresh Start');

INSERT INTO annual_milestones (month, year, target_subs, target_revenue, target_impressions)
VALUES
  (4,  2026, 80,    500,    1000000),
  (5,  2026, 200,   2300,   5000000),
  (6,  2026, 500,   5000,   10000000),
  (7,  2026, 1000,  10000,  20000000),
  (8,  2026, 2000,  20000,  40000000),
  (9,  2026, 3500,  35000,  70000000),
  (10, 2026, 5000,  50000,  100000000),
  (11, 2026, 8000,  100000, 200000000),
  (12, 2026, 12000, 150000, 300000000)
ON CONFLICT (month, year) DO NOTHING;

-- ─── Verification queries (run after the above) ─────────────────────────────
-- SELECT 'ab_test_groups'  AS tbl, count(*) FROM ab_test_groups
-- UNION ALL SELECT 'hook_performance', count(*) FROM hook_performance
-- UNION ALL SELECT 'storyline_arcs (active)', count(*) FROM storyline_arcs WHERE status = 'active'
-- UNION ALL SELECT 'annual_milestones 2026', count(*) FROM annual_milestones WHERE year = 2026;
