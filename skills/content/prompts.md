# Skill File: content/prompts
# Loaded by: content agent, qa agent, dm_processor.js, generate_image.js
# Last updated: 2026-04-04 (v9.0 — seedream v4.5, IP-Adapter FaceID, 5W+H DM)

---

## RULES

## RULE [R-001] — Updated 2026-04-04
CONDITION: fal.ai generation, beach/outdoor setting
OLD BEHAVIOR: generic beach prompts
NEW RULE: always include "candid behind-the-scenes feel, slight motion blur in hair"
CONFIDENCE: MEDIUM (not yet tested at n≥30)
VERIFIED_VIA: MindStudio methodology
EXPIRES: never (upgrade confidence when A/B tested)

## RULE [R-002] — Updated 2026-04-04
CONDITION: all tiers, all prompts
NEW RULE: include 3+ ANTI_AI_MODIFIERS per prompt (see constants below)
CONFIDENCE: MEDIUM
VERIFIED_VIA: standard practice
EXPIRES: never

## RULE [R-003] — Updated 2026-04-04
CONDITION: T1-B gym prompts
OLD BEHAVIOR: static poses ("standing in gym")
NEW RULE: always use action verbs — mid-squat, wiping sweat, mid-deadlift, checking form in mirror
CONFIDENCE: MEDIUM
VERIFIED_VIA: engagement research on fitness content
EXPIRES: never

## RULE [R-004] — Updated 2026-04-04 (v8→v9)
CONDITION: every generation call, face similarity check
NEW RULE:
  - face_similarity < 0.85 → REJECT image, do not post, log to agent_logs
  - face_similarity < 0.85 on 2 consecutive batches → yellow alert to owner
  - face_similarity < 0.80 → HARD STOP. Pause all generation. Add new hero refs
    and re-run: node scripts/setup_reference_dataset.js
  - Reference source: Supabase reference_images table (face_similarity=1.0 heroes)
  - generate_image.js fetches top 5 refs by setting+tier match + all hero images
  - No LoRA retraining. Character consistency via IP-Adapter FaceID.
CONFIDENCE: HIGH (technical requirement)
VERIFIED_VIA: character consistency research
EXPIRES: never

## RULE [R-005] — Updated 2026-04-04
CONDITION: all batches, all platforms
NEW RULE: never repeat same prompt_hash within 7 days on same platform.
  Check: SELECT prompt_hash FROM posts WHERE platform='[x]' AND created_at > NOW()-INTERVAL '7 days'
CONFIDENCE: HIGH
VERIFIED_VIA: platform freshness requirements
EXPIRES: never

## RULE [R-006] — Added 2026-04-04
CONDITION: DM PPV generation (T3), before any prompt is built
NEW RULE: 5W+H qualification REQUIRED. Generation blocked until all required fields collected.
  WHO (required) | WHAT (required) | WHERE (required) | WHEN (required) | WHY (required) | HOW (optional)
  Timeout: 4h → "surprise me" fallback with defaults.
  Logic lives in: scripts/dm_processor.js → getMissingFields(), buildPrompt()
CONFIDENCE: HIGH
VERIFIED_VIA: product spec v9.0
EXPIRES: never

## RULE [R-007] — Added 2026-04-04
CONDITION: T2 content, before generation
NEW RULE: load skills/qa/platform-rules.md. All T2 pass criteria must be met before
  submitting to generate_image.js. T2 is ONLY for Twitter/X and Reddit.
  T2 on any other platform = IMMEDIATE REJECT + log + owner alert.
CONFIDENCE: HIGH
VERIFIED_VIA: platform policy + CLAUDE.md v4.0
EXPIRES: never

---

## PERSONA CONSTANTS

```
BASE_APPEARANCE   = "young woman, wavy blonde hair, green eyes, tanned athletic build, minimal makeup"
TRIGGER_WORD      = "blondeshell_v1"
ANTI_AI_MODIFIERS = "minor skin imperfections, slight asymmetry, natural expression, candid feel, realistic skin texture, subtle pores"
NEGATIVE_PROMPT   = "explicit, nudity, cartoon, anime, (young:1.5), child, teen, minor, nsfw, logo, watermark, text"
MODEL             = fal-ai/seedream-v4-5
CONSISTENCY       = IP-Adapter FaceID via reference_images table (top 5 by setting+tier + all hero images)
```

---

## T1 PROMPT TEMPLATES

> T1 = SFW. Platforms: IG, TikTok, YT, Threads, LinkedIn, Twitch.
> Must maintain 30%+ visual distance from T2. When in doubt, use T1.

---

### T1-A — Beach / Outdoor

**Primary prompt:**
```
Photorealistic editorial photo of [BASE_APPEARANCE], [SETTING].
[OUTFIT]. [LIGHT]. Candid behind-the-scenes feel, slight motion blur in hair.
[ANTI_AI_MODIFIERS]. Editorial photography, 35mm film look, shot on Canon R5.
```

**SETTING rotation:**
| Slot | Value |
|------|-------|
| S-1  | golden hour beach, gentle waves behind her |
| S-2  | rocky tide pools at low tide, coastal cliff backdrop |
| S-3  | wooden boardwalk, ocean horizon |
| S-4  | open desert road, late afternoon haze |
| S-5  | lush hiking trail, dappled forest light |

**OUTFIT rotation:**
| Slot | Value |
|------|-------|
| O-1  | white linen button-up shirt, denim cutoffs, no shoes |
| O-2  | flowy sundress, light floral print |
| O-3  | denim shorts, white crop top, straw hat |
| O-4  | athletic shorts, loose tank, baseball cap |

**LIGHT rotation:** golden hour warm glow | soft overcast diffused | harsh midday with deep shadows | blue hour cool tones

**Negative:** `[NEGATIVE_PROMPT]`

**Pass criteria (T1-A):**
- No visible underwear or swimwear bottom below hip line
- No wet clothing that reveals body contours (flag for T2 review)
- No facial expression that reads as sexual (neutral/laughing/focused only)
- face_similarity ≥ 0.85

---

### T1-B — Gym / Fitness

**Primary prompt:**
```
Photorealistic sports photography of [BASE_APPEARANCE], [SETTING].
[OUTFIT]. [ACTION]. [ANTI_AI_MODIFIERS].
Candid sports photography, Nike campaign energy, natural gym lighting.
```

**SETTING rotation:**
| Slot | Value |
|------|-------|
| S-1  | modern gym, floor-to-ceiling mirrors, rack of barbells |
| S-2  | boutique fitness studio, wooden floors, barre |
| S-3  | outdoor gym, morning light, city skyline behind |
| S-4  | home gym setup, rubber flooring, minimal equipment |

**OUTFIT rotation:**
| Slot | Value |
|------|-------|
| O-1  | black sports bra, matching high-waist leggings |
| O-2  | athletic shorts, fitted tank top |
| O-3  | one-piece athletic bodysuit |
| O-4  | oversized gym t-shirt, bike shorts |

**ACTION rotation (action verbs — R-003 required):**
| Slot | Value |
|------|-------|
| A-1  | mid-squat, barbell on back, focused expression |
| A-2  | wiping sweat from forehead with wrist, slight smile |
| A-3  | checking form in mirror, hands on hips |
| A-4  | mid-deadlift, concentrated gaze downward |
| A-5  | stretching quad, one hand on wall |
| A-6  | tying shoe, crouched, gym floor |

**Negative:** `[NEGATIVE_PROMPT]`

**Pass criteria (T1-B):**
- Sports bra is acceptable if high-coverage (no bralette/lingerie look)
- No gratuitous glute-focused framing (side/back shot must have activity context)
- Sweat is acceptable — exaggerated wet look is T2 territory
- face_similarity ≥ 0.85

---

### T1-C — Home / Lifestyle — Gaming Audience

**Primary prompt:**
```
Photorealistic lifestyle photo of [BASE_APPEARANCE], [SETTING].
[OUTFIT]. [MOOD_DETAIL]. [ANTI_AI_MODIFIERS].
Authentic story-post energy, soft interior light, shot on iPhone Pro.
```

**SETTING rotation:**
| Slot | Value |
|------|-------|
| S-1  | cozy gaming setup, monitor glow ambient light, RGB strip behind desk |
| S-2  | modern kitchen, morning light, mug of coffee in hand |
| S-3  | living room couch, controller nearby, throw blanket |
| S-4  | home office, laptop open, plants in background |
| S-5  | balcony, morning, city view, reading |

**OUTFIT rotation:**
| Slot | Value |
|------|-------|
| O-1  | oversized gaming hoodie, logo subtle, hair up messy bun |
| O-2  | soft linen coord set, relaxed fit |
| O-3  | cozy pajama set, socks visible |
| O-4  | fitted athleisure set, no shoes |

**MOOD_DETAIL rotation:**
| Slot | Value |
|------|-------|
| M-1  | laughing at screen, hand over mouth |
| M-2  | focused, biting lip slightly, headset on |
| M-3  | relaxed smile, holding mug with both hands |
| M-4  | candid scroll on phone, sitting cross-legged |

**Negative:** `[NEGATIVE_PROMPT]`

**Pass criteria (T1-C):**
- Pajamas/loungewear acceptable if non-sheer, fully covering
- No bedroom-only framing without clear lifestyle context (bed + laptop = ok; bed alone = T2 flag)
- Gaming/tech props encouraged — increases audience resonance
- face_similarity ≥ 0.85

---

## T2 DEFINITION + PASS CRITERIA

> T2 = Suggestive. Platforms: Twitter/X and Reddit ONLY.
> Must maintain 30%+ visual distance FROM T3 (explicit).
> Full platform rules: skills/qa/platform-rules.md

### T2 Definition
T2 content is **suggestive but non-explicit**. It implies rather than shows. It is legal everywhere,
platform-compliant on Twitter/X and Reddit, and stops strictly short of nudity or explicit acts.

**T2 IS:**
- Lingerie / bikini / revealing athletic wear (visible but not exposed)
- Wet look, body-conscious outfits, suggestive poses (implied, not anatomical)
- Bedroom / bath settings with clothing on
- Flirty expression + revealing outfit combination
- Undergarment visible as intended fashion (bra strap, waistband)

**T2 IS NOT:**
- Nudity of any kind (nipple, genitalia, full posterior exposure)
- Explicit sexual acts or simulated acts
- Content where age could be ambiguous (HARD STOP — see R-AGE below)
- Content that sexualizes minors in any indirect way (HARD STOP)
- T3 content posted to T2 platforms (Fanvue-only content leaked to Twitter = IMMEDIATE BAN RISK)

### T2 Prompt Template
```
Photorealistic fashion/editorial photo of [BASE_APPEARANCE], [SETTING].
[OUTFIT — T2 level]. [POSE]. Tasteful, artistic, high-end editorial feel.
[ANTI_AI_MODIFIERS]. Shot on medium format, studio or lifestyle setting.
```

**T2 OUTFIT examples:**
- black lace lingerie set, fully covering, lying on satin sheets reading
- high-cut one-piece swimsuit, pool setting, wet hair
- sheer blouse over bandeau bra, editorial styling, confident pose
- bodycon dress, evening setting, form-fitting but fully clothed

**T2 POSE guidelines:**
- Standing / seated / lying with legs together or natural
- Back shots acceptable if no explicit anatomy
- No spread-leg framing, no anatomically focused crops

### T2 PASS CRITERIA — ALL must be TRUE before generation

| # | Criterion | Check |
|---|-----------|-------|
| 1 | Destination platform is Twitter/X or Reddit ONLY | `platform IN ('twitter', 'reddit')` |
| 2 | No nudity anywhere in the prompt | Prompt scan: no "nude", "topless", "naked", "nipple", "genitalia" |
| 3 | Age signals are unambiguous adult (25–35 appearance) | BASE_APPEARANCE used verbatim — no "young", "teen", "petite teen" |
| 4 | face_similarity ≥ 0.85 post-generation | Checked by generate_image.js automatically |
| 5 | prompt_hash not used on same platform in last 7 days | DB query (R-005) |
| 6 | Platform-rules.md loaded and reviewed | Agent must confirm load |
| 7 | Content visually 30%+ different from last T2 post | Visual hash diff check (or manual flag) |

### T2 INSTANT REJECT conditions (any one = HARD STOP + delete + owner alert)
- Age ambiguity in any form
- Explicit anatomy visible in output (even unintended — check output image)
- Destination is IG, TikTok, YT, Threads, LinkedIn, or Twitch
- face_similarity < 0.80

---

## VIDEO PROMPT TEMPLATES

### V-LOOP (Kling 2.0 — 6s default)
```
[BASE_APPEARANCE] performing [MOTION] in [SETTING].
Motion smooth, continuous, designed to loop seamlessly end-to-start.
[CAMERA]. Photorealistic. 9:16 vertical. [ANTI_AI_MODIFIERS].
```

**MOTION rotation:** slow hair toss | turning to look at camera | walking toward camera | laughing and looking away | adjusting outfit | stretching

**CAMERA rotation:** slow push-in | static locked-off | slow pan left-to-right

**Model:** `fal-ai/kling-video/v2/standard/image-to-video`
**start_frame_url:** use T1 or T3 generated still that passed face_similarity ≥ 0.85

---

## PROMPT BUILDING — dm_processor.js integration

When `qualification_complete = true`, `buildPrompt()` in dm_processor.js assembles:

```
{WHO}, {WHAT}, at {WHERE}, {WHEN} lighting, {WHY} mood[, {HOW}]. High quality, photorealistic.
```

Select the matching T1-A / T1-B / T1-C template as the base and inject 5W+H values into
the SETTING / ACTION / MOOD_DETAIL slots before passing to `generate_image.js`.

```js
// Example mapping
WHO   → prepend to BASE_APPEARANCE if custom, else use BASE_APPEARANCE default
WHAT  → maps to ACTION (gym) or MOOD_DETAIL (home) or pose note (beach)
WHERE → selects template: beach→T1-A, gym→T1-B, home→T1-C, travel→T1-A variant
WHEN  → maps to LIGHT slot
WHY   → maps to energy/mood note appended to prompt
HOW   → appended as camera/outfit override if present
```
