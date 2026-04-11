# SKILL: schedule_post
**Token savings: ~600 tokens per call**

## Description
Schedule a post to one platform via Publer's bulk API. Uses pre-mapped account IDs and network keys. Confirmed working as of 2026-04-09 (job_id: 69d7de10a506909964782e3c, status: complete).

## Trigger Phrases
- "schedule"
- "post to [platform]"
- "publish"
- "schedule for [time]"
- "queue this for [platform]"

## Input Schema
```json
{
  "platform": "instagram | tiktok | twitter",
  "media_url": "string — public Supabase Storage URL (permanent)",
  "caption": "string — platform-appropriate caption",
  "scheduled_at": "string — ISO 8601 UTC, e.g. 2026-04-10T14:00:00Z",
  "is_video": "boolean — default false"
}
```

## Output Schema
```json
{
  "job_id": "string — Publer job ID",
  "status": "string — 'complete' = success"
}
```

## Account IDs (hardcoded — do not change)
| Platform  | Account ID                   | Network Key  |
|-----------|------------------------------|--------------|
| Instagram | 69d763474d92c20853b2f6bd     | ig_business  |
| TikTok    | 69d76503f9cf2bb87988ea09     | tiktok       |
| Twitter/X | 69d7698ff9cf2bb87988f76b     | twitter      |

## Optimal Posting Times (ET → UTC in April, offset +4h)
| Platform  | Times ET         | Times UTC        |
|-----------|------------------|------------------|
| Instagram | 7pm              | 23:00            |
| TikTok    | 11am, 7pm        | 15:00, 23:00     |
| Twitter   | 9am, 12pm, 6pm, 9pm | 13:00, 16:00, 22:00, 01:00 |

## Implementation
```js
import { schedulePost, getPlatformIds } from './lib/publer.js';

const platformIds = await getPlatformIds();
const account = platformIds[input.platform]; // { id, networkKey }

const jobId = await schedulePost({
  accountId: account.id,
  networkKey: account.networkKey,
  caption: input.caption,
  scheduledAt: input.scheduled_at,
  mediaUrl: input.media_url,
  isVideo: input.is_video ?? false,
});
```

## Payload Format (bulk — confirmed working)
```json
{
  "bulk": {
    "state": "scheduled",
    "posts": [{
      "networks": {
        "{networkKey}": { "type": "photo|video|status", "text": "{caption}", "media_urls": ["{url}"] }
      },
      "accounts": [{ "id": "{accountId}", "scheduled_at": "{iso_utc}" }]
    }]
  }
}
```

## Network Types
| Scenario          | type      |
|-------------------|-----------|
| Twitter text only | status    |
| Twitter with image| photo     |
| Instagram image   | photo     |
| Instagram video   | video     |
| TikTok            | video     |

## Job Status Check
```js
import { verifyPostLive } from './lib/publer.js';
const isLive = await verifyPostLive(jobId); // true when status = 'complete'
```

## Example Usage
```
User: "post the beach image to Twitter at 9am tomorrow"
→ platform=twitter, scheduled_at=2026-04-10T13:00:00Z
→ caption="golden hour 🌅"
→ Returns: job_id → poll verifyPostLive until true
```
