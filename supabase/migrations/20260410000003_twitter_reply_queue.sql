CREATE TABLE IF NOT EXISTS twitter_reply_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tweet_url TEXT NOT NULL,
  account_handle TEXT,
  follower_count INT,
  tweet_topic TEXT,
  draft_reply TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'posted', 'skipped')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  posted_at TIMESTAMPTZ
);
