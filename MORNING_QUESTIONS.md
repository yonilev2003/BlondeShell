# Morning Questions — Sprint 2 Kickoff (Apr 19, 2026)

> This file is for **YOU** to review in the morning. Answer the questions in a new Claude session — or mark ✅ if verified, ❌ if issue.

---

## 🌙 PART A — Night Session Verification

You ran `npm run schedule:night` last night. In the morning, verify each step succeeded. Results file: `/tmp/night_session/results.json`.

### A1. Image Generation
- [ ] All 12 images generated? (check `/tmp/night_session/*.png` — should be 12 files)
- [ ] Any failed generations? (check console output — failures logged to `results.json` under `failed[]`)
- [ ] **If <12:** regenerate missing ones by running `node scripts/night_session_batch.mjs` again (will skip those that exist)

### A2. QA Gate
- [ ] How many approved vs rejected? (in `results.json` → `approved` count)
- [ ] Any face similarity warnings (<0.85)? Any T2/T3 leakage on T1?
- [ ] **If rejected:** review `/tmp/night_session/` images manually — decide regenerate or cut

### A3. Publer Scheduling
- [ ] How many `scheduleResults.ok: true`? (target: 2x `approved.length` = TikTok + Instagram)
- [ ] Open app.publer.com → Scheduled tab → do Tue + Wed posts show up?
- [ ] Any `scheduleResults.ok: false` — what error?

### A4. Monday Posts (Today — first real launch day!)
- [ ] 6 posts scheduled for Monday (from Sprint 1) — did they publish on time?
- [ ] Check TikTok: @itstheblondeshell — 3 posts live (gym/home/beach)?
- [ ] Check Instagram: @itstheblondeshell — 3 posts live?
- [ ] **If Instagram failed:** likely the `validity=false` warning was real. Check Publer → Published tab for error. May need to adjust image aspect ratio in `lib/image_convert.js`.

### A5. Stale Publer Post
- [ ] Did you delete the `"I can't write content promoting..."` post from Publer → Scheduled? (manual cleanup required)

---

## 🎯 PART B — Sprint 2 Decisions

Sprint 2 is for Apr 19. Before starting, decide:

### B1. nsfwjs Integration (Priority: LOW)
**Question:** Replace Claude vision QA with local `nsfwjs` classifier to save cost?
- **Pro:** ~$0.02/image saved → at 30 images/day = $18/month saved
- **Con:** 2-4h dev time + maintenance + local model = 150MB deps
- **Current state:** Claude vision works, cost is bearable
- **Your call:** Skip (Sprint 3+) / Do now / Only if Claude cost >$30 this week

### B2. Voice Clone Reference Audio
**Question:** Current ElevenLabs voice ID `briGJOLAce4pTnmxMbbi` works — but is the voice *right*?
- Listen to: `/tmp/voice_social.mp3`, `/tmp/voice_dm.mp3`, `/tmp/voice_vlog.mp3` (generated in Sprint 1)
- If voice feels off → upload new reference audio to ElevenLabs, update `ELEVENLABS_VOICE_ID` in .env
- If voice is good → keep, proceed to vlog test

### B3. First Vlog Test (30s)
**Question:** Ready to generate first vlog end-to-end?
- Pipeline: script (Claude) → narration (ElevenLabs) → start frames (Seedream) → video (Kling i2v) → lipsync (Kling) → stitch (ffmpeg)
- **Risk:** first real test, might hit bugs
- **Cost:** ~$0.50 per 30s vlog
- **Action if yes:** `node -e "import('./lib/vlog.js').then(m => m.generateVlog({ arcId: 'arc_001', duration: 30 }))"`

### B4. Content Batch for Sprint 2 Night
**Question:** Generate 18 images + 6 short videos tonight?
- Pros: fills Thu-Sat slots
- Cons: ~$3-5 spend (videos are expensive on Kling)
- Alternative: just 18 images first, videos tomorrow
- **Your call:** Full batch / Images only / Skip to Sprint 3

---

## 📊 PART C — Data to Check Before Sprint 2

Pull these yourself (or ask new Claude to run):

### C1. Supabase Quick Check
```bash
# Count generated content from night session
# Should equal approved count from results.json
```
Via Supabase SQL:
```sql
SELECT COUNT(*) FROM generated_content WHERE created_at > NOW() - INTERVAL '12 hours';
SELECT platform, COUNT(*) FROM post_analytics WHERE posted_at > NOW() - INTERVAL '24 hours' GROUP BY platform;
```

### C2. Publer Scheduled Count
Open app.publer.com → Scheduled → should see:
- 6 Monday posts (from Sprint 1) → moving to "Published" after today
- ~24 new scheduled posts (Tue + Wed × TikTok + Instagram × ~6 approved) from night session

### C3. Analytics (First Real Post Data!)
- TikTok: check first 3 posts' views at 2h, 6h mark
- Instagram: impressions + likes in first 2h
- **This is your first real signal.** If a post hits >5K in 2h → mark as winner, prep spin-offs (A/B testing engine is ready).

---

## 🚀 PART D — Sprint 2 Plan (If Night Session OK)

When you start a new Claude session in the morning, paste this to resume:

> "Sprint 1 complete per claude_progress.txt. Night session ran. Review MORNING_QUESTIONS.md answers:
> - A1-A5: [✅/❌ + notes]
> - B1: [skip/do]
> - B2: [voice OK / need re-clone]
> - B3: [vlog test yes/no]
> - B4: [full/images only/skip]
>
> Start Sprint 2 per plan."

New Claude will know exactly where to pick up.

---

## ⚠️ If Night Session FAILED Completely

If `npm run schedule:night` errored out:
1. Save the error output to a file (`> /tmp/night_error.log`)
2. In morning: "Night session failed. Error in /tmp/night_error.log. Diagnose + fix."
3. Common culprits:
   - Supabase storage bucket `content` doesn't exist → create in dashboard
   - fal.ai quota hit → check billing at fal.ai dashboard
   - Publer 429 rate limit → retry in an hour
   - Face similarity too low on hero refs → regenerate hero dataset

---

## 📋 END-OF-SESSION SUMMARY (this session)

Today (Apr 18):
- ✅ Merged `claude/push-to-github-PjFnX` → `main` (v5.2 is now canonical)
- ✅ `claude_progress.txt` updated (reflects merge + night pending)
- ⏳ Night session: **YOU must run `npm run schedule:night` on Mac** (sandbox blocked)

Tomorrow (Apr 19, Sprint 2):
- Review this file
- Answer B1-B4
- Generate 18 images + vlog test (if approved)
- Check first Monday posts going live

Launch: Apr 24 (6 days away).

---

*File auto-generated 2026-04-18 EOD. Delete after Sprint 2 kickoff.*
