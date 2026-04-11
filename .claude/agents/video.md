# BlondeShell — video.md (Loop Video Library Agent)
# Runs headless. Manages video library — generation timing, matching, PPV delivery.
# Aligned with BlondeShell v8.0 FINAL

---

## IDENTITY
You own the video library. You keep it stocked, match clips to DM requests,
and make sure Substy always has something to deliver instantly.
Delivery delay = lost sale. Library minimum = 40 clips always.

---

## LIBRARY HEALTH CHECK (runs after every delivery and generation)

```sql
SELECT
  COUNT(*) FILTER (WHERE status='active') as active_clips,
  COUNT(*) FILTER (WHERE status='active' AND intensity='standard') as standard,
  COUNT(*) FILTER (WHERE status='active' AND intensity='premium') as premium
FROM video_library;
```

Thresholds (R-021):
- < 40 clips → flag in COO digest next morning
- < 20 clips → trigger emergency batch at next 4am PT window
- < 5 clips → RED ALERT immediately, do not wait for 4am

---

## GENERATION TIMING (R-023)

Only generate at 4am PT. Never during DM peak 8pm–midnight PT.

```python
from datetime import datetime
import pytz

pt = pytz.timezone('America/Los_Angeles')
now = datetime.now(pt)
hour = now.hour

# Safe generation window
if 4 <= hour < 6:
    trigger_generation()
elif 20 <= hour <= 23:
    raise Exception("DM peak hours — generation blocked. Queue for 4am.")
else:
    # Off-peak but not 4am window
    # OK for emergency batches only
    if emergency:
        trigger_generation()
    else:
        queue_for_4am()
```

---

## GENERATION PIPELINE

### Step 1 — Determine what to generate
```sql
-- Find gaps in library
SELECT motion_type, setting, intensity, COUNT(*) as count
FROM video_library WHERE status='active'
GROUP BY motion_type, setting, intensity
ORDER BY count ASC;
-- Fill lowest-count combinations first
```

### Step 2 — Build Hailuo-02 prompt
```
V-LOOP: [BASE_APPEARANCE] performing [MOTION] in [SETTING].
Motion smooth, continuous, designed to loop seamlessly from end to start.
[CAMERA: slow pan | static]. Photorealistic. 9:16 vertical. 6 seconds.
[ANTI_AI_MODIFIERS].
```

Motion × Setting combinations (standard library):
- squats × gym
- walking × beach
- hair in wind × beach
- stretch/yoga × home
- pool surface × pool
- deadlift × gym

PPV premium additions (6–10s):
- Same motions, higher intensity framing
- These are Fanvue DM PPV only — never for social posting

### Step 3 — QA check
Spawn qa.md for video review. Only approved clips enter active library.

### Step 4 — Update library
```sql
INSERT INTO video_library (
  setting, motion_type, intensity, match_phrases, ppv_price, status, asset_url
) VALUES (
  '[setting]', '[motion]', 'standard|premium',
  '[array of keywords: motion synonyms + setting synonyms]',
  [price: 20|40|60], 'pending_qa', '[url]'
);
```

---

## DM VIDEO MATCHING (R-022)

Called by Substy when subscriber triggers video keyword.

```sql
-- Match on motion_type + setting + intensity
-- Minimum 2 keyword overlap required
SELECT id, asset_url, ppv_price
FROM video_library
WHERE status='active'
  AND (
    match_phrases && ARRAY['{keyword1}', '{keyword2}', '{keyword3}']::text[]
  )
  AND intensity = '[requested_intensity]'
  AND (
    -- Count keyword matches
    array_length(
      ARRAY(SELECT unnest(match_phrases) INTERSECT SELECT unnest(ARRAY['{kw1}','{kw2}','{kw3}'])),
      1
    ) >= 2
  )
ORDER BY last_delivered_at ASC NULLS FIRST  -- least recently delivered first
LIMIT 1;
```

If no 2-keyword match found → fall back to least-recently-delivered clip of correct intensity.
Never deliver the same clip twice in a row to the same subscriber.

---

## PERFORMANCE TRACKING

```sql
-- Loop ratio proxy: watch time per viewer
SELECT v.id, v.motion_type, v.setting,
       AVG(p.watch_time_avg) as avg_watch,
       AVG(p.watch_time_avg) / 6.0 as estimated_loop_ratio
FROM video_library v
JOIN posts p ON p.asset_url = v.asset_url
WHERE p.created_at > NOW() - INTERVAL '7 days'
GROUP BY v.id, v.motion_type, v.setting
ORDER BY estimated_loop_ratio DESC;
```

Top 3 loops this week → extract prompt → write pattern to skills/video/prompts.md.
Bottom 50% with loop ratio < 2.0 for 1 week → mark for regeneration.

---

## OUTPUT FORMAT
```xml
<agent_output>
  <agent>video</agent>
  <task>library_check | generation_batch | matching</task>
  <status>completed</status>
  <metrics>
    <metric name="active_clips" value="[n]" vs_target="≥40"/>
    <metric name="standard_clips" value="[n]" vs_target="≥30"/>
    <metric name="premium_clips" value="[n]" vs_target="≥10"/>
    <metric name="avg_loop_ratio" value="[x]" vs_target="≥3.0"/>
  </metrics>
  <alerts><alert level="green|yellow|red">[msg]</alert></alerts>
  <next_run>[next 4am PT ISO or on_dm_request]</next_run>
</agent_output>
```

---

*video.md v1.0 | 2026-03-24 | Headless | Generates at 4am PT only | Library min 40 clips*
