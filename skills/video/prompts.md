# Skill File: video/prompts
# Loaded by: video agent, content agent, dm agent
# Last updated: 2026-04-04 (v9.0)

---

## RULE [R-021] — Added 2026-03-23 by COO (starter rule)
CONDITION: video library count check (runs after every delivery and generation)
NEW RULE:
  < 40 clips → flag in COO digest
  < 20 clips → emergency batch at next 4am PT window
  < 5 clips  → RED ALERT to owner immediately
CONFIDENCE: HIGH
VERIFIED_VIA: DM delivery SLA requirements
EXPIRES: never

## RULE [R-022] — Added 2026-03-23 by COO (starter rule)
CONDITION: DM video request matching
NEW RULE: match on motion_type + setting + intensity. Minimum 2 keyword overlap required.
  If no 2-keyword match → fall back to least-recently-delivered clip of correct tier.
  Never deliver same clip twice in a row to same subscriber.
CONFIDENCE: HIGH
VERIFIED_VIA: DM experience research
EXPIRES: never

## RULE [R-023] — Added 2026-03-23 by COO (starter rule)
CONDITION: video generation timing
NEW RULE: generate at 4am PT only. NEVER generate during DM peak: 8pm–midnight PT.
  Reason: fal.ai API performance highest off-peak; DM responses must be instant.
CONFIDENCE: HIGH
VERIFIED_VIA: API performance research
EXPIRES: never

---

## KLING 2.0 STACK

```
Model  : fal-ai/kling-video/v2/standard/image-to-video
Input  : { image_url, duration (string), prompt? }
Output : { video.url } or { video_url }
Retry  : maxRetries=3, baseDelayMs=2000
Default duration: 6s (string "6")
PPV premium:      6–10s
```

---

## 6 MOTION TYPES

| motion_type | Description | loop_ratio_estimate | Best Settings |
|-------------|-------------|---------------------|---------------|
| `loop` | Cyclical A→B→A motion, seamlessly cut | 0.85 | gym, stretch, hair, pool |
| `subtle` | Micro-movements — breathing, hair drift, water ripple | 0.50 | home, beach, pool |
| `dynamic` | High-energy single-direction motion | 0.50 | gym, beach, surf |
| `pan` | Camera move across a still subject | 0.50 | travel, outdoor |
| `bob` | Gentle vertical oscillation in water or seat | 0.50 | pool, lounge |
| `stride` | Continuous walking/jogging motion, loop at matching step | 0.50 | beach, street |

Loop ratio heuristic is set in `generate_video.js:74`. Only `loop` type scores 0.85; all others 0.50 until real analytics override.

---

## LOOP DESIGN PATTERNS

| Category | motion_type | Loop Cut Point | Platform | Duration |
|----------|-------------|----------------|----------|----------|
| Squat / Deadlift | `loop` | Top of rep → bottom of descent | TikTok, IG, YT | 6s |
| Walking beach | `stride` | Matching footfall position | TikTok, X | 6s |
| Hair in wind | `loop` | Wind gust peak → same gust peak | IG, TikTok | 6s |
| Pool / Water | `bob` | Water level at same point | X, Reddit, Fanvue | 6s |
| Stretch / Yoga | `loop` | Position A → B → A | TikTok, IG | 6s |
| Surfing | `dynamic` | Apex of pop-up | TikTok primary | 6s |
| Micro-moment | `subtle` | Subtle breath cycle end | IG, TikTok | 6s |
| PPV Premium | any | Same mechanics, higher intensity | Fanvue DM only | 6–10s |

**Loop design rule:** the last frame must visually match the first frame. For `loop` type, specify `"seamless loop from end to start"` in prompt.

---

## START_FRAME SELECTION CRITERIA

Priority order when choosing `start_frame_url`:

1. **Face similarity ≥ 0.85** — confirmed via reference_images.face_similarity column
2. **Setting match** — reference_images.setting matches requested setting
3. **Tier match** — T1/T2/T3 must match intended distribution platform
4. **used_as_start_frame = false preferred** — avoid recycling frames already in library
5. **Most recent hero reference** — from assets/reference/hero/ (30-image dataset)

Rejection rules (mirror CLAUDE.md):
- face_similarity < 0.85 → REJECT frame
- face_similarity < 0.85 twice in a row → yellow alert
- face_similarity < 0.80 → HARD STOP, add new hero refs, re-run setup_reference_dataset.js

Start frame is upserted to reference_images with `used_as_start_frame: true` on every call (`generate_video.js:38–49`).

---

## KLING 2.0 PROMPT TEMPLATES

### Generic format
```
V-LOOP: [BASE_APPEARANCE] performing [MOTION] in [SETTING].
Motion [LOOP_INSTRUCTION]. Camera: [CAMERA]. Photorealistic. 9:16 vertical. [DURATION] seconds.
[ANTI_AI_MODIFIERS]
```

### Per motion_type templates

**loop**
```
V-LOOP: [BASE_APPEARANCE] performing [MOTION] in [SETTING].
Motion smooth and continuous, seamlessly looping from end back to start.
Camera: static. Photorealistic. 9:16 vertical. 6 seconds.
Natural skin texture, soft shadows, no artifacts, no flash cuts.
```

**subtle**
```
V-LOOP: [BASE_APPEARANCE] in [SETTING], micro-movements only — gentle breathing, slight hair drift.
No large gestures. Camera: static close or mid shot. Photorealistic. 9:16 vertical. 6 seconds.
Natural skin texture, ambient light, no artifacts.
```

**dynamic**
```
V-LOOP: [BASE_APPEARANCE] performing [HIGH_ENERGY_MOTION] in [SETTING].
Full commitment to motion, peak energy at midpoint. Camera: slight follow. Photorealistic. 9:16 vertical. 6 seconds.
No motion blur artifacts, sharp subject.
```

**pan**
```
V-LOOP: [BASE_APPEARANCE] standing/sitting in [SETTING].
Slow horizontal camera pan left to right across subject and environment.
Camera: smooth pan. Photorealistic. 9:16 vertical. 6 seconds.
Cinematic color, no jitter.
```

**bob**
```
V-LOOP: [BASE_APPEARANCE] in [WATER/POOL SETTING], gentle vertical bob with water.
Water surface ripples consistent throughout. Camera: static. Photorealistic. 9:16 vertical. 6 seconds.
Natural water caustics, no artifacts.
```

**stride**
```
V-LOOP: [BASE_APPEARANCE] walking along [SETTING] at natural pace.
Loop cut at identical footfall — left foot forward at start and end.
Camera: side-follow or static. Photorealistic. 9:16 vertical. 6 seconds.
Natural motion, no stutter.
```

---

## LOOP PERFORMANCE TARGETS

- Watch time per viewer: target > 20s (primary automated KPI)
- Loop ratio estimate: target > 3.0 (manual weekly check)
- Loop ratio < 2.0 for 1 week → regenerate bottom 50% of library
- Top 3 loops/week → extract prompt → append as new rule to this file

---

## GENERATION CALL REFERENCE

```js
const { generateVideo } = require('./scripts/generate_video');

await generateVideo({
  start_frame_url,   // string — URL of face-verified seedream image
  motion_type,       // one of: loop | subtle | dynamic | pan | bob | stride
  setting,           // beach | gym | home | travel | pool | other
  duration_seconds,  // 6 (default) or 6–10 for PPV
  prompt,            // assembled from template above
  dm_event_id,       // optional — links clip to a DM fulfillment row
});
// returns { video_url, loop_ratio_estimate }
```

Logged to: `video_library` table + `agent_actions` via `logAgentAction`.

*v9.0 | 2026-04-04 | Full stack: CLAUDE.md | Generation: scripts/generate_video.js | State: Supabase video_library*
