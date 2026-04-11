-- Migration: add row_type to twitter_reply_queue
-- Distinguishes target account seeds (scanned by morning bot) from draft replies (inserted by bot)
-- 2026-04-10

ALTER TABLE twitter_reply_queue
  ADD COLUMN IF NOT EXISTS row_type TEXT NOT NULL DEFAULT 'draft';

-- Tag the 20 seeded profile-URL rows as targets
UPDATE twitter_reply_queue
  SET row_type = 'target'
  WHERE tweet_url LIKE 'https://x.com/%'
    AND tweet_url NOT LIKE 'https://x.com/i/web/status/%';

ALTER TABLE twitter_reply_queue
  ADD CONSTRAINT twitter_reply_queue_row_type_check
  CHECK (row_type IN ('target', 'draft'));
