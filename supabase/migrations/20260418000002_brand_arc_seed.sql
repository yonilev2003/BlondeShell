-- v5.2 Brand Arc #1 seed: "The LA Arrival"
-- Kickoff arc for launch (Apr 24 - May 24, 2026). Strategy agent uses this
-- as context for first month's content. Replace/extend after Month 1 review.

INSERT INTO storyline_arcs (
  name,
  description,
  start_date,
  end_date,
  locations,
  themes,
  status
)
VALUES (
  'LA Arrival — The Fresh Start',
  'BlondeShell just moved to LA from a small town. Everything is new: the apartment, the gym, the beach, the nightlife. This arc documents her settling-in era: exploring Santa Monica, trying new pilates studios, furnishing her place, first LA friendships, and discovering her LA aesthetic. Mix of excitement, occasional homesickness, and manifesting the dream life. Authentic "fresh-off-the-plane" Gen Z energy.',
  '2026-04-24',
  '2026-05-24',
  ARRAY['santa_monica', 'west_hollywood', 'melrose', 'venice_beach', 'pilates_studio', 'new_apartment'],
  ARRAY['fresh_start', 'apartment_setup', 'beach_exploration', 'fitness_journey', 'solo_era', 'california_dream', 'making_friends'],
  'active'
)
ON CONFLICT DO NOTHING;

-- Annual milestones for launch year
INSERT INTO annual_milestones (month, year, target_subs, target_revenue, target_impressions)
VALUES
  (4,  2026, 80,   500,    1000000),   -- April launch partial month
  (5,  2026, 200,  2300,   5000000),   -- May: Month 1 ambitious
  (6,  2026, 500,  5000,   10000000),  -- June: Month 2 scale
  (7,  2026, 1000, 10000,  20000000),  -- July: Month 3 viral push
  (8,  2026, 2000, 20000,  40000000),
  (9,  2026, 3500, 35000,  70000000),
  (10, 2026, 5000, 50000,  100000000),
  (11, 2026, 8000, 100000, 200000000),
  (12, 2026, 12000, 150000, 300000000)
ON CONFLICT (month, year) DO NOTHING;
