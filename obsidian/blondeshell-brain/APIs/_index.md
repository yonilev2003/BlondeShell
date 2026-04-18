---
title: APIs Index
updated: 2026-04-18
---

# APIs Reference Index

Canonical source of API formats, endpoints, and patterns for every service BlondeShell uses. Agents load these on-demand via `lib/obsidian.js`.

## Files

| API | File | Status | When to load |
|-----|------|--------|--------------|
| Fanvue (v2025-06-26) | `fanvue.md` | ✅ working | Media upload, posts, DMs, insights, PPV |
| Publer (v1) | `publer.md` | ✅ working | Social scheduling, cross-platform posts, analytics |

## When stuck

- **Fanvue questions** → `api.fanvue.com/docs` Ask AI button
- **Publer questions** → `publer.com/docs` Ask AI button / support@publer.com
- **Both** — always include request body + response + mediaUuid/job_id when reporting

## Read pattern

```js
import { loadAPIReference } from '../lib/obsidian.js';
const publerDocs = loadAPIReference('publer');   // reads APIs/publer.md
```

Don't paste full docs into prompts — load relevant section when needed.
