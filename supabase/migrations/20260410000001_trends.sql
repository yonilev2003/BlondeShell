CREATE TABLE IF NOT EXISTS trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  stage TEXT CHECK (stage IN ('rising', 'peak', 'declining')),
  niche_fit_score INT CHECK (niche_fit_score BETWEEN 1 AND 10),
  blondeshell_adaptation TEXT,
  hours_remaining INT,
  redline BOOLEAN DEFAULT false,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);
