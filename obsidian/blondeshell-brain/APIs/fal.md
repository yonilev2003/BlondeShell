---
title: fal.ai API Reference
updated: 2026-04-18
models: seedream-v4.5-edit, kling-v3-standard-i2v
---

# fal.ai — BlondeShell Reference

## Auth

```
FAL_KEY env var — or:
fal.config({ credentials: process.env.FAL_KEY })
Header (raw fetch): Authorization: Key <FAL_KEY>
```

All requests via `@fal-ai/client` → `fal.subscribe(modelId, { input, logs })`.

---

## Model 1: Seedream v4.5 Edit (Image Generation)

**Model ID:** `fal-ai/bytedance/seedream/v4.5/edit`

Used for: generating BlondeShell images from prompt + reference images (IP-Adapter style).

### Input

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `prompt` | string | required | Text description of desired output |
| `image_urls` | string[] | required | Reference images (up to 10). We pass hero refs here. |
| `image_size` | enum | `auto_4K` | `portrait_4_3` for standard posts, `portrait_16_9` for stories |
| `num_images` | int | 1 | Parallel generations |
| `enable_safety_checker` | bool | true | Set false for T2/T3 |
| `seed` | int | random | Fix for reproducibility |
| `sync_mode` | bool | false | Returns data URI if true (don't use for large images) |

**image_size options:** `square_hd`, `square`, `portrait_4_3`, `portrait_16_9`, `landscape_4_3`, `landscape_16_9`, `auto_2K`, `auto_4K`

### Output

```json
{
  "images": [
    {
      "url": "https://...",
      "content_type": "image/png",
      "file_name": "output.png",
      "file_size": 1234567,
      "width": 1024,
      "height": 1365
    }
  ]
}
```

Access via: `result.data.images[0].url`

### Usage in code

```js
import { fal } from '@fal-ai/client';
fal.config({ credentials: process.env.FAL_KEY });

const result = await fal.subscribe('fal-ai/bytedance/seedream/v4.5/edit', {
  input: {
    prompt: `${promptCore} Keep her face, platinum blonde hair, green eyes identical. Photorealistic, 4K.`,
    image_urls: referenceUrls,   // hero refs from Supabase Hero_Dataset bucket
    image_size: 'portrait_4_3',
    enable_safety_checker: false,
    num_images: 1,
  },
  logs: false,
});

const imageUrl = result.data.images[0].url;
```

### Cost
~$0.04/image at portrait_4_3. `auto_4K` costs more.

### Retry logic (529 = overloaded)
Retry up to 3x with 8s / 16s / 32s backoff. All other errors → throw immediately.

---

## Model 2: Kling v3 Standard Image-to-Video

**Model ID:** `fal-ai/kling-video/v3/standard/image-to-video`

Used for: turning approved BlondeShell images into short video clips.

### Input

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `start_image_url` | string | required | Source image URL |
| `prompt` | string | optional | Motion description ("walks slowly toward camera") |
| `duration` | enum | `"5"` | `3`–`15` seconds |
| `generate_audio` | bool | true | Native audio — leave true for social |
| `end_image_url` | string | optional | Anchor end frame |
| `negative_prompt` | string | `"blur, distort, and low quality"` | Keep default |
| `cfg_scale` | float | 0.5 | How closely to follow prompt |

**duration options:** `3`, `4`, `5`, `6`, `7`, `8`, `9`, `10`, `11`, `12`, `13`, `14`, `15` (as strings)

### Output

```json
{
  "video": {
    "url": "https://...",
    "file_size": 3149129,
    "content_type": "video/mp4",
    "file_name": "out.mp4"
  }
}
```

Access via: `result.data.video.url`

### Usage in code

```js
const result = await fal.subscribe('fal-ai/kling-video/v3/standard/image-to-video', {
  input: {
    start_image_url: approvedImageUrl,
    prompt: 'Subtle natural movement, hair sways gently, soft smile. Cinematic, vertical.',
    duration: '5',
    generate_audio: false,    // we add ElevenLabs audio separately
    negative_prompt: 'blur, distort, and low quality',
    cfg_scale: 0.5,
  },
  logs: false,
});

const videoUrl = result.data.video.url;
```

### Cost
~$0.12/clip at 5s. Longer durations cost proportionally more.

---

## Queue API (for long jobs)

```js
// Submit without blocking
const { request_id } = await fal.queue.submit(modelId, { input, webhookUrl });

// Poll status
const status = await fal.queue.status(modelId, { requestId: request_id, logs: true });

// Get result when status.status === 'COMPLETED'
const result = await fal.queue.result(modelId, { requestId: request_id });
```

---

## File Upload (for local files)

```js
const file = new File([buffer], 'image.png', { type: 'image/png' });
const url = await fal.storage.upload(file);
// url is now a publicly accessible fal CDN URL
```

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `403 Host not in allowlist` | API key has IP/host restrictions | Create new key without restrictions |
| `403 Forbidden` | Wrong key scope (need API not Admin) | Use API-scoped key |
| `529 Overloaded` | Model queue full | Retry with exponential backoff |
| `422 Unprocessable` | Bad image format | Use PNG/JPEG/WEBP only |

---

## Key Reference in generate_image.js

```
lib/generate_image.js  — generateImage({ setting, tier, mood, referenceUrls, promptCore })
lib/generate_video.js  — generateVideo({ startImageUrl, setting, motionIndex, duration })
REFERENCE_SETS         — hero ref URLs per setting (beach/gym/home/street)
```
