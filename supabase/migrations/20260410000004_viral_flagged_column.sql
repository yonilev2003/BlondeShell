-- Migration: add viral_flagged to post_analytics
-- Prevents double-firing of virality trigger for posts already escalated
-- 2026-04-10

ALTER TABLE post_analytics
  ADD COLUMN IF NOT EXISTS viral_flagged BOOLEAN NOT NULL DEFAULT false;

-- Index for efficient polling query (every 2h)
CREATE INDEX IF NOT EXISTS post_analytics_viral_check_idx
  ON post_analytics (platform, posted_at, viral_flagged)
  WHERE viral_flagged = false;
