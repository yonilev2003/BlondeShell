# LESSONS.md — BlondeShell Pitfalls & Learnings

<!--
  Format enforced by lesson-extractor subagent.
  Every entry: Mistake / Cause / Fix / Prevention.
  Newest at top. Dedupe on Mistake line.
  When this file exceeds ~200 lines, split by domain (LESSONS-api.md, LESSONS-content.md, etc.)
-->

## How to read this file
Before starting any task, scan for keywords in your task description. If you're editing the QA layer, grep for `qa|vision|claude`. If touching image gen, grep `fal|seedream|kling`. If scheduling, grep `publer|cron|timezone`.

---

## Entries

<!-- New entries go above this line -->

### Pretrained NSFW classifiers mis-calibrated for fitness/lifestyle brand
- **Mistake:** Integrated nsfwjs (MobileNetV2 + InceptionV3) to replace Claude vision in QA gate to save $18/mo.
- **Cause:** Both models trained on general-purpose Yahoo Open NSFW dataset where "attractive person in swimwear/athletic wear" = Sexy. Our entire brand aesthetic is exactly that. 0/11 images approved.
- **Fix:** Reverted to Claude vision for QA. Accepted $18/mo cost vs broken router.
- **Prevention:** Before integrating any pretrained classifier, run it on 10+ representative samples of OUR brand content. If precision/recall off → don't ship. Logged in `lib/qa_gate.js` header.
- **Date:** 2026-04-19
- **Tags:** `qa`, `nsfw`, `model-selection`, `cost-optimization`

### tfjs-node native compile fails on Node 25 + paths with spaces
- **Mistake:** Added `@tensorflow/tfjs-node` dependency; `npm install` broke with `clang++: error: no such file or directory: '2/node_modules/...'`.
- **Cause:** (1) No prebuilt binary for Node 25 / N-API v10; (2) user's folder path `blondeshell_archive 2` contains a space that clang fails to quote in build args.
- **Fix:** Swapped to pure-JS `@tensorflow/tfjs` + `sharp` for image decode, then reverted entirely when model itself was wrong.
- **Prevention:** Avoid native npm deps in a project whose path might contain spaces. If native compile needed, check prebuilt binaries match the target Node version BEFORE adding the dep. Logged in `package.json` review checklist.
- **Date:** 2026-04-19
- **Tags:** `npm`, `native-deps`, `tfjs`, `node-version`

### Claude vision API requires HTTPS URLs — local paths fail
- **Mistake:** `runFullQA({ url: '/tmp/night_session/beach.png' })` returned 400 "Only HTTPS URLs are supported" for every image.
- **Cause:** Claude messages API `{ type: 'image', source: { type: 'url' } }` requires `https://`. Local filesystem paths are rejected server-side.
- **Fix:** Upload image to Supabase storage first, pass the public HTTPS URL.
- **Prevention:** Any code path that feeds images to Claude vision must go through `uploadToSupabase()` or equivalent. Never pass `localPath` to `runFullQA`. Guard added in `night_session_batch.mjs`.
- **Date:** 2026-04-19
- **Tags:** `claude-vision`, `qa`, `api-contracts`

### Cron calling `runAgent()` on files that live in lib/ silently fails
- **Mistake:** `cron.schedule('0 4 * * *', () => runAgent('pipeline'))` → no error, but agent never runs. Same bug on `inspiration_engine` and `vlog_pipeline`.
- **Cause:** `runAgent(name)` spawns `node agents/${name}.js`. Those three modules live in `lib/`, not `agents/`. Spawn fails to find file, exits with error code, but cron swallows it.
- **Fix:** Added `runLib(libFile, fnName, argsJson)` helper in `webhook/server.js` that imports the lib module and calls an exported function. Updated 3 cron lines.
- **Prevention:** When adding a new cron entry, verify the target file exists at the expected path. Add a boot-time sanity check that fails the server start if cron targets missing modules. TODO for Sprint 3.
- **Date:** 2026-04-19
- **Tags:** `cron`, `webhook`, `silent-failure`

### Publer dashboard displays in user's local timezone, not UTC
- **Mistake:** Scheduled 6 Monday posts, user saw only 3 on Monday in Publer — thought posts were lost.
- **Cause:** Publer displays times in user's browser-local timezone (Israel = UTC+3). Posts scheduled late UTC on Monday roll over to Tuesday in IL display. Nothing was lost; distribution just shifted.
- **Fix:** Counted totals across all days (14 scheduled = 14 visible) to verify no loss.
- **Prevention:** When diagnosing "missing posts", always check the TOTAL count across ±1 day before assuming loss. Document the display TZ in `obsidian/blondeshell-brain/APIs/publer.md`.
- **Date:** 2026-04-19
- **Tags:** `publer`, `timezone`, `debugging`

### Twitter posts silently absent from Publer schedule despite connected account
- **Mistake:** Night session script added Twitter posts; zero Twitter posts appear in Publer Scheduled tab.
- **Cause:** Unknown — most likely `getPlatformIds()` in `lib/publer.js` isn't returning the twitter account object correctly (or Publer API naming drift). Script silently skips when `accounts.twitter` is falsy.
- **Fix:** Pending. Not yet debugged.
- **Prevention:** Scripts that iterate over platforms should log which platforms were included vs skipped, and fail-loud if an expected platform is missing. Add assertion in `schedule_videos_batch.mjs` and `night_session_batch.mjs`.
- **Date:** 2026-04-19
- **Tags:** `publer`, `twitter`, `silent-skip`

---
