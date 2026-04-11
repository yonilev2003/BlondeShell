# SKILL: generate_image
**Token savings: ~800 tokens per call**

## Description
Generate a character-consistent image for BlondeShell using fal-ai/bytedance/seedream/v4.5/edit with pre-configured reference sets. Automatically selects the correct reference images for the given setting.

## Trigger Phrases
- "generate image"
- "create photo"
- "new image"
- "generate [setting] image"
- "create [mood] photo"

## Input Schema
```json
{
  "setting": "beach | gym | street | home",
  "tier": "T1 | T2",
  "mood": "string — e.g. golden_hour, athletic, cozy, urban",
  "prompt_core": "string — scene description without character traits",
  "seed": "number? — optional, for reproducibility"
}
```

## Output Schema
```json
{
  "url": "string — fal.media temporary URL",
  "width": "number",
  "height": "number"
}
```

## Implementation
```js
import { generateImage, REFERENCE_SETS } from './lib/generate_image.js';

const img = await generateImage({
  setting: input.setting,           // auto-selects REFERENCE_SETS[setting]
  tier: input.tier ?? 'T1',
  mood: input.mood,
  promptCore: input.prompt_core,
  seed: input.seed,
});
// img.url is the result
```

## Reference Sets (auto-applied by setting)
| Setting | References used |
|---------|----------------|
| beach   | beach_T1_sunset_face.jpeg, outdoor_T1_golden_medium.jpeg, studio_T1_closeup_neutral.png, closeup_T1_face_hero.png |
| gym     | gym_T1_indoor_full.png, outdoor_T1_golden_athletic.jpeg, studio_T1_closeup_neutral.png, closeup_T1_face_hero.png |
| street  | studio_T1_closeup_neutral.png, travel_T1_desert_golden_hero.png, outdoor_T1_golden_medium.jpeg |
| home    | studio_T1_closeup_neutral.png, closeup_T1_face_hero.png, outdoor_T1_golden_medium.jpeg, beach_T1_sunset_face.jpeg |

## T1 Suffix (auto-appended for T1)
> "Keep her face, platinum blonde hair, green eyes, and athletic body identical. Professional photography, photorealistic, 4K, natural lighting."

## QA Gate
- Score ≥ 0.85: auto-approve
- Score 0.80–0.84: yellow alert, flag for review
- Score < 0.80: HARD STOP — add new hero refs, re-run setup_reference_dataset

## Example Usage
```
User: "generate a beach image for tomorrow's post"
→ setting=beach, tier=T1, mood=golden_hour
→ promptCore="sitting on sandy beach at golden hour, white linen sundress"
→ Returns: img.url for QA and upload
```

## Retry Policy
- 529 overloaded: exponential backoff 8s → 16s → 32s (3 attempts)
- Forbidden: log to mistakes/, alert owner — do NOT retry automatically
