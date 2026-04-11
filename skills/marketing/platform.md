# Skill File: marketing/platform
# Loaded by: marketing agent, coo agent
# Last updated: 2026-04-04 (v9.0 — aligned with CLAUDE.md v4.0)

---

## RULE [R-015] — Updated 2026-04-04
CONDITION: posting frequency defaults, all platforms
NEW RULE: X:4/d, Reddit:3/d, IG:2/d, TikTok:1/d, Threads:2/d, YT:1/d, LinkedIn:3×/week, Twitch:2×/week live
CONFIDENCE: MEDIUM (Week 1 hypothesis — replace with data after Week 2)
VERIFIED_VIA: general social media research + prior v8 baseline
EXPIRES: Week 2 (marketing agent replaces with data-validated schedule)

## RULE [R-016] — Added 2026-03-23
CONDITION: any platform CTR < 0.5% for 3 consecutive days
NEW RULE: reduce frequency 50% on that platform. Test 3 new title/hook angles same day. COO alert.
CONFIDENCE: HIGH
VERIFIED_VIA: performance recovery methodology
EXPIRES: never

## RULE [R-017] — Added 2026-03-23
CONDITION: Reddit posting
NEW RULE: never post same sub twice/day. No repeat image in same sub within 30 days.
  CHECK: SELECT * FROM posts WHERE platform='reddit' AND subreddit='[x]'
         AND created_at > NOW()-INTERVAL '30d'
CONFIDENCE: HIGH
VERIFIED_VIA: Reddit platform rules
EXPIRES: never

## RULE [R-018] — Added 2026-04-04
CONDITION: any post exceeds 3× platform average engagement within 2h of posting
NEW RULE: VIRAL_SIGNAL = true. Extract hook, format, time, visual style → log to
  skills/marketing/viral_patterns.md. Replicate that pattern next 3 posts on that platform.
  COO alert: green level.
CONFIDENCE: HIGH
VERIFIED_VIA: standard content amplification methodology
EXPIRES: never

## RULE [R-019] — Added 2026-04-04
CONDITION: posting T2 content
NEW RULE: platforms allowed = Twitter/X and Reddit ONLY. Any attempt to post T2 to IG, TikTok,
  YT, Threads, LinkedIn, or Twitch → HARD STOP. Log error. Owner alert.
CONFIDENCE: HIGH
VERIFIED_VIA: CLAUDE.md content tier rules
EXPIRES: never

---

## PLATFORM STRATEGY OVERVIEW

| Platform      | Posts/Day    | Post Times (PT)          | Tier         | M1 Imp. Goal | Primary Goal            |
|---------------|-------------|--------------------------|--------------|--------------|-------------------------|
| Twitter/X     | 4           | 8am, 12:30pm, 6pm, 10pm  | T2 ONLY      | 1,500,000    | Direct Fanvue conversion|
| Reddit        | 3           | 9am, 2pm, 8pm            | T2 ONLY      | 1,500,000    | Volume + discovery      |
| TikTok        | 1           | 6pm                      | T1 ONLY      | 1,000,000    | Viral reach, top-of-funnel|
| Instagram     | 2           | 7am, 7pm                 | T1 ONLY      | 500,000      | Brand + ManyChat DM funnel|
| YouTube Shorts| 1           | 3pm                      | T1 ONLY      | 300,000      | Long-tail SEO, evergreen |
| Threads       | 2           | 9am, 5pm                 | T1 ONLY      | 100,000      | Personality + IG crossover|
| LinkedIn      | 3×/week     | Mon/Wed/Fri 9am          | T1 ONLY      | 50,000       | Creator narrative, B2B   |
| Twitch        | 2×/week live| Tue/Thu 7pm              | T1 ONLY      | 50,000       | Community + DM CTA       |
| Fanvue        | Daily       | —                        | T1 + T2 + T3 | —            | Direct revenue (PPV/subs)|

All times = initial hypothesis. Marketing agent replaces with data-validated schedule by end of Week 2.

---

## PER-PLATFORM DETAIL

### Twitter/X — T2 — 4×/day
- **Content mix:** ratio personality:T2 = 1:3 (1 SFW hook post, 3 suggestive)
- **Hook formats:** hot takes, gaming culture reactions, "just woke up" candids, response threads
- **CTA cadence:** every 2nd post includes Fanvue link in first reply (not body — avoids suppression)
- **Viral levers:** quote-tweet controversy, ratio bait, reply to trending gaming/creator accounts
- **Suppression risk:** avoid link in tweet body; use Linktree or first-reply CTA
- **Platform rules ref:** skills/qa/platform-rules.md#twitter

### Reddit — T2 — 3×/day
- **Subreddit rotation:** r/OnlyFansPromos, r/Fansly_Promos, r/blondes, r/RealGirls, r/LivestreamFail (T1 crossover), r/gaming (T1 only)
- **Title strategy:** first-person narrative, lowercase, relatable moment — gaming vernacular preferred
- **Hard rules:** no same sub twice/day (R-017). No repeat image in same sub within 30 days.
- **CTA:** Fanvue link in first comment, not title
- **Viral levers:** post timing (peak sub activity windows), upvote velocity in first 30 min
- **Sample titles:**
  - "golden hour hit different today — needed this after a 6-hour ranked session"
  - "when the gym lighting actually cooperates (rare W)"
  - "beach > discord at 2am, change my mind"
  - "post-workout energy is unmatched and i will die on this hill"
  - "the pool is empty at 7am and i am taking full advantage while you are still in bed"
  - "finally captured what i was going for — 47 attempts, worth it"

### TikTok — T1 — 1×/day
- **Aesthetic:** cozy streamer, 'caught in my setup', golden hour, athletic lifestyle
- **Format:** 15–30s vertical, trending audio, text overlay hook in first 2s
- **AI label:** ALWAYS ON — TikTok AI label required. No exceptions. (CLAUDE.md)
- **CTA:** "link in bio → Fanvue" — ManyChat auto-reply triggers on comment keywords
- **Viral levers:** trending audio selection, hook in first frame, loop-able ending
- **Suppression risk:** avoid direct mention of OnlyFans/Fanvue in video or caption

### Instagram — T1 — 2×/day
- **Formats:** Reel (primary) + Carousel or static (secondary)
- **AI label:** Meta AI label ON + "AI-generated" in bio always. (CLAUDE.md)
- **CTA:** ManyChat DM automation — comment trigger → DM with Fanvue link
- **Content:** lifestyle, gym, travel, golden hour — 30%+ visual distance from T2 versions
- **Story cadence:** 3–5 stories/day (polls, Q&A, countdown, behind-scenes)
- **Viral levers:** Reel audio trends, share-to-story CTA, collab post format

### YouTube Shorts — T1 — 1×/day
- **Format:** vertical, 30–60s, SEO-optimized title + description + tags
- **Strategy:** evergreen content (gym, travel, lifestyle) — discoverability over trending
- **CTA:** pinned comment with Fanvue link + end screen card
- **Title formula:** "[emotion/moment] + [relatable context]" — e.g., "Morning routine hits different when you actually sleep 8 hours"
- **Viral levers:** thumbnail face expression, curiosity-gap title, strong hook second-1

### Threads — T1 — 2×/day
- **Content:** personality-forward, opinion posts, day-in-life fragments, replies to trends
- **Tone:** casual, witty, self-aware — distinct from IG captions
- **CTA:** soft link ("details in bio") — no hard sell
- **Viral levers:** thread replies to large accounts, hot-take format, relatability > aesthetics

### LinkedIn — T1 — 3×/week (Mon/Wed/Fri)
- **Angle:** "How I built an AI creator business" — tech + entrepreneur audience
- **Format:** 150-word narrative post, no images required, occasional screenshot proof
- **Topics:** AI content workflow, creator economy data, business milestones, lessons learned
- **CTA:** none (brand building only) — link only in profile, not posts
- **Viral levers:** personal narrative + contrarian takes on creator economy

### Twitch — T1 — 2×/week live (Tue/Thu 7pm PT)
- **Stream type:** casual gaming, cozy stream, AI-disclosed
- **Duration:** 2–3h target
- **CTA cadence:** Fanvue mention every 30 min via StreamElements command (!fanvue)
- **Clip strategy:** clip highlight reels → post to TikTok/YT next day
- **Viral levers:** raid trains, host network, clip virality on Twitter/X

---

## FUNNEL MAP

```
TikTok / IG / YouTube → bio link → Fanvue (T1 → T3 upsell)
Twitter/X / Reddit     → first comment link → Fanvue (T2 → T3 PPV)
Twitch                 → chat command → Fanvue
LinkedIn               → profile link → Fanvue (low volume, high LTV)
Threads                → bio link → Fanvue
```

---

## VIRAL TRIGGER PLAN

### Green Zone — Business as usual
- All platforms posting on schedule
- Total impressions on track for M1 goal

### Yellow Alert Triggers (auto-notify COO)
- Day 10 total impressions < 500,000
- Any single platform 3-day avg CTR < 0.5%
- TikTok follower growth < 50/day after Day 7
- Reddit posts averaging < 20 upvotes after 3 days

**Yellow response:**
1. marketing agent pulls last 20 posts per platform → identify lowest performers
2. Pause lowest-performing format for 48h
3. Test 3 new hook angles (title-only change) same day
4. Double posting frequency on best-performing platform
5. COO reviews at next daily digest

### Red Alert Triggers (owner decision required)
- Day 14 total impressions < 1,000,000
- Any platform account flagged or restricted
- TikTok / IG post removed for content policy
- Twitter/X account action (shadowban signal: impressions drop >70%)

**Red response:**
1. PAUSE all posting on flagged platform immediately
2. Owner manual login required
3. Activate ConvertKit email backup sequence
4. Redirect all CTA traffic to Fanvue direct link
5. marketing agent generates recovery plan within 4h

### Virality Signal — Amplification protocol
- **Trigger:** any post reaches 3× platform avg engagement within 2h
- **Actions:**
  1. Extract: hook text, format type, time posted, visual style, tier
  2. Log to: skills/marketing/viral_patterns.md
  3. Replicate pattern: next 3 posts on that platform use same hook structure
  4. Cross-post signal: adapt hook for top 2 other platforms same day
  5. COO alert: green level ("virality signal on [platform] — replicating")

---

## DATA VALIDATION — END OF WEEK 2

Marketing agent must replace R-015 frequency hypothesis with actual data:
```sql
SELECT platform,
       AVG(impressions) as avg_impressions,
       AVG(ctr) as avg_ctr,
       COUNT(*) as posts,
       SUM(fanvue_clicks) as total_clicks
FROM posts
WHERE created_at > NOW() - INTERVAL '14d'
GROUP BY platform
ORDER BY avg_ctr DESC;
```
Output → updated frequency + timing table → overwrite PLATFORM STRATEGY OVERVIEW section.
Update R-015 confidence from MEDIUM → HIGH once validated.

---

*v9.0 | 2026-04-04 | Aligned with CLAUDE.md v4.0 | 8 platforms | Fanvue fee 20% everywhere*
