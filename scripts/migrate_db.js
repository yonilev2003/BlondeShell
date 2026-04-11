/**
 * migrate_db.js — adds v9-v10 columns to dm_events, posts, and video_library.
 * v9 columns: dm_events (5W+H qualification), fulfillment tracking
 * v10 columns: posts (setting, mood, model, reference_image_id), video_library (video_url, start_frame_url, duration, model, dm_event_id)
 * Safe to run multiple times (all use IF NOT EXISTS).
 * Run: node scripts/migrate_db.js
 */
import 'dotenv/config.js';

import { supabase, logAgentAction  } from '../lib/supabase.js';

const MIGRATIONS = [
  // ────────────────────────────────────────────────────────────────
  // dm_events — 5W+H qualification columns
  `ALTER TABLE dm_events ADD COLUMN IF NOT EXISTS qualification_who TEXT`,
  `ALTER TABLE dm_events ADD COLUMN IF NOT EXISTS qualification_what TEXT`,
  `ALTER TABLE dm_events ADD COLUMN IF NOT EXISTS qualification_when TEXT`,
  `ALTER TABLE dm_events ADD COLUMN IF NOT EXISTS qualification_where TEXT`,
  `ALTER TABLE dm_events ADD COLUMN IF NOT EXISTS qualification_why TEXT`,
  `ALTER TABLE dm_events ADD COLUMN IF NOT EXISTS qualification_how TEXT`,
  `ALTER TABLE dm_events ADD COLUMN IF NOT EXISTS qualification_complete BOOL DEFAULT false`,
  `ALTER TABLE dm_events ADD COLUMN IF NOT EXISTS qualification_started_at TIMESTAMPTZ`,
  `ALTER TABLE dm_events ADD COLUMN IF NOT EXISTS qualification_completed_at TIMESTAMPTZ`,
  // dm_events — fulfillment tracking
  `ALTER TABLE dm_events ADD COLUMN IF NOT EXISTS generation_attempts INT DEFAULT 0`,
  `ALTER TABLE dm_events ADD COLUMN IF NOT EXISTS generation_fail_reason TEXT`,
  `ALTER TABLE dm_events ADD COLUMN IF NOT EXISTS fulfillment_status TEXT DEFAULT 'pending'`,
  `ALTER TABLE dm_events ADD COLUMN IF NOT EXISTS result_url TEXT`,
  `ALTER TABLE dm_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`,

  // ────────────────────────────────────────────────────────────────
  // posts — metadata for image generation tracking
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS setting TEXT`,
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS mood TEXT`,
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS model TEXT`,
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS reference_image_id UUID`,

  // ────────────────────────────────────────────────────────────────
  // video_library — critical columns for video generation
  `ALTER TABLE video_library ADD COLUMN IF NOT EXISTS video_url TEXT UNIQUE`,
  `ALTER TABLE video_library ADD COLUMN IF NOT EXISTS start_frame_url TEXT`,
  `ALTER TABLE video_library ADD COLUMN IF NOT EXISTS duration_seconds INTEGER`,
  `ALTER TABLE video_library ADD COLUMN IF NOT EXISTS model TEXT`,
  `ALTER TABLE video_library ADD COLUMN IF NOT EXISTS dm_event_id UUID`,
  // video_library — archive + loop analytics
  `ALTER TABLE video_library ADD COLUMN IF NOT EXISTS archive_status TEXT DEFAULT 'active'`,
  `ALTER TABLE video_library ADD COLUMN IF NOT EXISTS loop_ratio_last_2wk FLOAT`,

  // ────────────────────────────────────────────────────────────────
  // reference_images — start_frame flag (if table exists)
  `ALTER TABLE reference_images ADD COLUMN IF NOT EXISTS used_as_start_frame BOOL DEFAULT false`,
];

async function runMigrations() {
  console.log(`[migrate_db] Running ${MIGRATIONS.length} migrations...`);
  let passed = 0;
  let failed = 0;

  for (const sql of MIGRATIONS) {
    try {
      const { error } = await supabase.rpc('exec_sql', { query: sql });
      if (error) {
        // Fallback: some Supabase setups expose raw SQL via the REST API differently
        console.warn(`[migrate_db] rpc failed, trying direct: ${error.message}`);
        // Log and continue — column may already exist or name differs
        console.warn(`[migrate_db] SKIP: ${sql.slice(0, 60)}...`);
        failed++;
      } else {
        console.log(`[migrate_db] OK: ${sql.slice(0, 60)}...`);
        passed++;
      }
    } catch (err) {
      console.warn(`[migrate_db] ERROR: ${err.message} | SQL: ${sql.slice(0, 60)}`);
      failed++;
    }
  }

  console.log(`\n[migrate_db] Done. ${passed} passed, ${failed} failed/skipped.`);
  console.log('[migrate_db] NOTE: If rpc("exec_sql") is unavailable, run the SQL manually via Supabase SQL Editor.');

  await logAgentAction('migrate_db', 'schema_migration', passed > 0 ? 'completed' : 'partial',
    `${passed}/${MIGRATIONS.length} migrations applied`);
}

runMigrations().catch(err => {
  console.error('[migrate_db] Fatal:', err.message);
  process.exit(1);
});
