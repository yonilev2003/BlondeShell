# BlondeShell — Day 8 Launch Kit
# Generated: 2026-04-10 | DO NOT POST until launch day signal
# All content is T1 / beach batch unless noted

---

## TASK 1 — Twitter/X Opening Posts (3 captions)
Platform: Twitter/X | Tier: T1 | Batch: beach
Post at: 09:00 / 12:00 / 18:00 IL (scheduled_posts slots)

---

### Tweet 1 — 09:00 IL
```
she showed up. different build, different energy.
this is what powerful looks like at golden hour 🌅
fanvue.com/blondeshell
```
**Char count:** 97 ✓

---

### Tweet 2 — 12:00 IL
```
not everyone trains for the beach.
some of us just live there. elite mindset,
elite results. you know where to find me 👇
fanvue.com/blondeshell
```
**Char count:** 131 ✓

---

### Tweet 3 — 18:00 IL
```
built different isn't a vibe. it's a decision.
made mine a long time ago 🤍
fanvue.com/blondeshell
```
**Char count:** 95 ✓

---

## TASK 2 — Reddit r/blondes First Post

### Title
```
first time posting here, hope this is okay 🌊
```

### Body
```
been at the beach all week. finally got a shot I actually liked.
```

**Notes:**
- No self-promotion in title ✓
- No Fanvue mention ✓
- "new to reddit" energy ✓
- Body is casual, single observation — invites engagement without asking for it

---

## TASK 3 — TikTok First Post Caption

### Caption
```
POV: your stats are maxed but you still train like it's Day 1 💪⚔️
#stellarblade #fitcheck #gamerfit #beachworkout #levelup
```
**Char count:** 92 ✓ (under 150)
**Hashtags:** 5 ✓ (niche only — no #fyp #viral)

### Sound
**Stellar Blade OST** — "A Drone" or "Orcal" (rising on TikTok fitness edits as of Apr 10 brief)
Match beat drop to transition from gym to beach frame if editing as a reel-style cut.

---

## TASK 4 — Fanvue First Post (Subscribers Only)

### Caption
```
hey you. glad you're here 🤍

spent the last few days on the beach doing absolutely nothing responsible — and I regret none of it. these shots came out better than I expected, so consider this your welcome gift.

the squat series drops next. $15 PPV. it's the one I almost didn't post.

you'll understand when you see it.
```

**Notes:**
- Audience: `subscribers` only (`isFree: true` for this welcome post — hooks them before first PPV)
- Tone: flirtatious, personal, confident — not transactional
- Beach batch reference: "spent the last few days on the beach" ✓
- PPV2 teaser: squat series at $15 ✓ — framed as something worth gatekeeping ("almost didn't post")
- No explicit content ✓ — creates anticipation without describing

---

## POST ORDER ON LAUNCH DAY

| Time (IL) | Platform | Post | Notes |
|-----------|----------|------|-------|
| 07:00 | Instagram Feed | scheduled_posts slot | fill_publer_queue handles |
| 09:00 | Twitter | Tweet 1 (powerful) | manual or Publer |
| 09:00 | Fanvue | Welcome post | lib/fanvue.js createPost() |
| 11:00 | TikTok | Caption above | scheduled_posts slot |
| 12:00 | Twitter | Tweet 2 (elite) | manual or Publer |
| 12:00 | Instagram Story | scheduled_posts slot | fill_publer_queue handles |
| 14:00 | Reddit | r/blondes post | manual |
| 18:00 | Twitter | Tweet 3 (built different) | manual or Publer |
| 19:00 | Instagram Reels | scheduled_posts slot | fill_publer_queue handles |

---

*launch_kit.md v1.0 | 2026-04-10 | All content T1 unless noted | Fanvue post = isFree:true, audience:subscribers*
