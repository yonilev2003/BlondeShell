---
title: Publer API v1 Reference
updated: 2026-04-18
source: https://app.publer.com/api/v1
version: v1
---

# Publer API v1 — BlondeShell Reference

## Constants

```
BASE_URL = https://app.publer.com/api/v1
AUTH     = Bearer-API {API_KEY}
WS_ID    = 69d761ddf9cf2bb87988e12f  (BlondeShell Business)
```

Required headers on every request:
```
Authorization: Bearer-API ${process.env.Publer_API}
Publer-Workspace-Id: ${process.env.PUBLER_WORKSPACE_ID}
Content-Type: application/json
```

Rate limit: **100 req / 2 min** per user. Watch `X-RateLimit-Remaining` header.

---

## Account IDs (BlondeShell)

| Platform  | Type           | Account ID                 |
|-----------|----------------|----------------------------|
| Instagram | ig_business    | `69d763474d92c20853b2f6bd` |
| TikTok    | tiktok         | `69d76503f9cf2bb87988ea09` |

Twitter connected but **suspended** — do NOT post there in Month 1.

---

## CRITICAL: Media must be uploaded to Publer FIRST

**WRONG (what we did, caused silent failures):**
```js
schedulePost({ mediaUrl: "https://supabase.../img.jpg" })  // ❌
```

**RIGHT:**
```
1. POST /media/from-url { url: "https://..." } → job_id
2. GET /job_status/{job_id} → waits, returns media { id, ... }
3. POST /posts/schedule with media: [{ id: "publer_id", type: "photo" }]
```

---

## 1. Upload media from URL (async)

```http
POST /media/from-url
Body: {
  "media": [{ "url": "https://...", "name": "...", "caption": "" }],
  "type": "single",
  "direct_upload": false,
  "in_library": false
}
```

Response: `{ "job_id": "..." }`

Then poll:

```http
GET /job_status/{job_id}
```

Response when done:
```json
{
  "status": "complete",
  "payload": {
    "failures": {},
    "media": [{
      "id": "6813892b5ec8b1e65235ae9e",
      "path": "https://cdn.publer.io/...",
      "thumbnail": "https://...",
      "type": "photo",
      "width": 1451, "height": 1005,
      "validity": { ... }  // which networks/types support this media
    }]
  }
}
```

**IMPORTANT:** Check `validity` object — tells you which networks accept this media as which post type.

---

## 2. Upload media directly (multipart, ≤200MB)

```http
POST /media
Content-Type: multipart/form-data
Fields:
  file: <binary>
  direct_upload: false
  in_library: false
```

Response: Same shape as from-url completion (sync).

---

## 3. Schedule a post

```http
POST /posts/schedule
Body: {
  "bulk": {
    "state": "scheduled",
    "posts": [{
      "networks": {
        "instagram": {             // or "ig_business"
          "type": "photo",
          "text": "caption here",
          "media": [{ "id": "PUBLER_MEDIA_ID", "type": "image" }]
        }
      },
      "accounts": [{
        "id": "69d763474d92c20853b2f6bd",
        "scheduled_at": "2026-04-20T19:00:00Z"
      }]
    }]
  }
}
```

Response: `{ "success": true, "data": { "job_id": "..." } }`

---

## 4. Verify job

```http
GET /job_status/{job_id}
```

States:
- `"status": "working"` — still processing
- `"status": "complete"` with `"failures": {}` — success
- `"status": "complete"` with `"failures": [...]` — partial failure (check details)

---

## Network-specific post formats

### Instagram (type: ig_business)

**Photo:**
```json
"instagram": {
  "type": "photo",
  "text": "caption",
  "media": [{ "id": "...", "type": "image", "alt_text": "optional" }]
}
```

**Reel (video 3-90s, 9:16):**
```json
"instagram": {
  "type": "video",
  "text": "caption",
  "media": [{ "id": "...", "type": "video", "thumbnails": [...], "default_thumbnail": 0 }],
  "details": { "type": "reel", "feed": false }
}
```

**Story (≤15s):**
```json
"instagram": {
  "type": "photo",  // or video
  "media": [{ "id": "...", "type": "photo" }],
  "details": { "type": "story" }
}
```

**Instagram REQUIRES:** Business/Creator account connected via Facebook Page. Error "composer is in a bad state" = missing FB Page connection.

### TikTok

**Video (SUPPORTED, preferred):**
```json
"tiktok": {
  "type": "video",
  "text": "caption #hashtags",
  "media": [{
    "id": "...", "path": "...",
    "default_thumbnail": 0,
    "thumbnails": [{ "real": "...", "small": "..." }]
  }],
  "details": {
    "privacy": "PUBLIC_TO_EVERYONE",
    "comment": true, "duet": true, "stitch": true,
    "promotional": false, "paid": false, "reminder": false
  }
}
```

**Photo carousel (SUPPORTED, up to 35 photos):**
```json
"tiktok": {
  "type": "photo",
  "title": "Summer Vibes ☀️",       // REQUIRED for TikTok photos
  "text": "caption",
  "media": [
    { "id": "...", "path": "...", "caption": "Beach" },
    { "id": "...", "path": "...", "caption": "Sunset" }
  ],
  "details": {
    "privacy": "PUBLIC_TO_EVERYONE",
    "auto_add_music": true,
    "comment": true,
    "promotional": false, "paid": false, "reminder": false
  }
}
```

**TikTok rules:**
- No mixing photos with videos/GIFs
- No recurring/recycled posts (duplicate content blocked)
- No watermarks
- No links in posts
- Privacy can be `PUBLIC_TO_EVERYONE`, `MUTUAL_FOLLOW_FRIENDS`, `FOLLOWER_OF_CREATOR`, `SELF_ONLY`
- Branded content cannot be private

### Twitter/X

```json
"twitter": {
  "type": "status",  // or "photo" | "video" | "link" | "poll"
  "text": "280 chars (25K for Premium via details.type: 'long_post')"
}
```

### Reddit — NOT in Publer's core supported list for current account. If needed, check alternative.

---

## 5. Analytics

### Post insights
```http
GET /analytics/{account_id}/post_insights
  ?from=2026-04-20&to=2026-04-27
  &sort_by=engagement_rate&sort_type=DESC
  &page=0
```

Returns per-post: reach, engagement, likes, comments, shares, saves, video_views, link_clicks, engagement_rate, click_through_rate, reach_rate.

### Best times heatmap
```http
GET /analytics/{account_id}/best_times?from=...&to=...
```

Returns `{ Monday: [0..23 scores], Tuesday: [...] }`. Scores are relative — higher = better.

### Hashtag analysis
```http
GET /analytics/{account_id}/hashtag_insights?sort_by=posts&page=0
```

### Competitor analytics
```http
GET /competitors/{account_id}/analytics
```

---

## Daily limits (Business plan)

| Platform | Posts/day |
|----------|-----------|
| Instagram Posts+Reels | 25 |
| Instagram Stories | 25 |
| TikTok | 25 |
| Twitter | 100 |

---

## Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `composer in bad state ... missing the social` | IG not connected via FB Page | Connect via Meta Business |
| `undefined method 'count' for nil` (TikTok) | Raw URL in media_urls instead of media ID | Upload via /media first |
| `Rate limit exceeded` (429) | >100 req/2min | Back off exponentially |
| `job.status=complete` but `failures=[...]` | Per-network rejection | Check failures[].message |

---

## When stuck

Ask Publer's AI assistant at `app.publer.com/docs` → "Ask AI" button. Provide job_id + error message.
