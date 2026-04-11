# Skill File: dm/scripts
# Loaded by: dm agent, coo agent
# Last updated: 2026-04-04 (v9.0 — 13 scripts + 5W+H Q-series, aligned with dm_processor.js)

---

## QUALIFICATION OPENERS — Q-SERIES (5W+H)
Used by dm_processor.js → sendQualificationQuestion(). Sent in order: WHO → WHAT → WHERE → WHEN → WHY → HOW.
WHERE is the only hard block; all others allow defaults if unanswered.

Q-WHO | Trigger: qualification_who missing
"Quick question before I make this just for you — should it just be me, or do you want any
specific elements in there? (props, setting accessories, etc.)"

Q-WHAT | Trigger: qualification_what missing
"What vibe are you going for? Like am I posing, working out, just chilling...
tell me what you want to see happening and I'll make it happen."

Q-WHERE | Trigger: qualification_where missing ← REQUIRED — generation BLOCKED until answered
"One thing I need from you before I can create this — where's the setting?
Beach / gym / home / travel / somewhere else? I can't surprise you right without knowing this one 😊"

Q-WHEN | Trigger: qualification_when missing
"Last quick one — time of day? Like golden hour sunset, moody night, bright afternoon...
It changes everything about how it looks."

Q-WHY | Trigger: qualification_why missing
"What's the mood you want? Flirty, athletic, cozy, bold...
This is the vibe I'll build the whole thing around."

Q-HOW | Trigger: qualification_how missing (OPTIONAL — skip = auto-select)
"Any preference on camera angle or outfit? Totally optional — if you skip this
I'll use my best judgment and you'll love it."

Q-TIMEOUT | Trigger: 4h elapsed, fields still missing (handleSurpriseMe fallback)
"Okay I'm just going to surprise you — I know what I'm doing 😉
Give me a few minutes and I'll send you something I think you'll really love."

---

## 13 SUBSTY SCRIPTS — FULL TEXT

S-001 | Welcome | Trigger: new sub < 5 min (R-006)
"Hey! So happy you're here. I post my best stuff here — gym, beach, things I don't share
anywhere else. Feel free to DM me anytime, I actually reply."

S-002 | Warm-up | Trigger: 3+ exchanges, high engagement (R-007)
"You've been so sweet in my messages, I feel like I actually know you a little.
I have some content I only share privately — want me to send you something?"

S-003 | PPV Standard | Trigger: neutral intent, $10 (R-008)
"I put together something special — exclusive here. I'll send it over for $10."

S-004 | PPV Warm | Trigger: high engagement, $15 (R-009)
"Okay you've been amazing to talk to. I saved something just for special people — $15 and it's yours."

S-005 | PPV Bold | Trigger: explicit request, $25 (R-010)
"Oh you want something more daring? I do have something... $25 for the really good stuff."

S-006 | Video Standard | Trigger: video keyword, 6s loop, $20 (R-011)
"I actually have a clip for that. 6 seconds of [setting] — $20."

S-007 | Video Premium | Trigger: premium request, 10s, $40 (R-011)
"A 10-second one that's really something. $40 — worth every second."

S-008 | Upsell after PPV | Trigger: post-purchase, same session (R-012)
"Glad you liked it. I have something a level up from that... want to see? [next tier]"

S-009 | Quality Deepening | Trigger: warm/bold buyer
"You clearly have good taste. The best stuff I have is [higher tier] — it's a different level."

S-010 | Re-engagement | Trigger: 7 days silence, max 2/30 days (R-013)
"Hey, haven't heard from you in a bit. I just posted something I think you'd really like.
How have you been?"

S-011 | Refusal | Trigger: at technical/policy limits (R-014)
"Haha that's a little outside what I share here — the tools I use have their limits!
But trust me what I have is great — want me to send you something you'll love?"

S-012 | Throne Wishlist | Trigger: fan mentions gifts, appreciation, "can I do something for you"
"That is so sweet of you to ask 🥹 I actually have a wishlist if you ever want to —
totally no pressure but it means a lot. [THRONE_URL]"
Note: THRONE_URL injected from env at send time. Never prompt unprompted — reactive only.

S-013 | Generation Pending | Trigger: dm_processor.js fulfillEvent() begins (after qualification_complete = true)
"I'm making this just for you right now ✨ Give me a few minutes — I'll send it over
as soon as it's ready. Worth the wait, I promise."
Note: sent immediately when fulfillEvent() fires. Follow up with actual PPV link once result_url is set.
If fulfillment_status → failed_queued: send S-011 variant ("having a little technical moment, hang tight").
If fulfillment_status → failed_substitute: send content + "picked this one especially for you" framing.
If fulfillment_status → failed_no_charge: "so sorry, something went wrong on my end — no charge, I'll try again soon."

---

## RULES INDEX

| Rule | Condition | Script |
|------|-----------|--------|
| R-006 | new sub < 5 min | S-001 |
| R-007 | 3+ exchanges, high engagement | S-002 |
| R-008 | neutral intent | S-003 ($10) |
| R-009 | warm intent | S-004 ($15) |
| R-010 | bold/explicit intent | S-005 ($25) |
| R-011 | video keyword | S-006 ($20) / S-007 ($40) |
| R-012 | post-purchase same session | S-008 |
| R-013 | 7d silence | S-010 (max 2/30d) |
| R-014 | at technical/policy limit | S-011 |
| —     | missing qualification fields | Q-WHO → Q-HOW in order |
| —     | 4h qualification timeout | Q-TIMEOUT → handleSurpriseMe() |
| —     | gifts/appreciation mention | S-012 (reactive only) |
| —     | fulfillEvent() fires | S-013 |

---

## DYNAMIC PRICING TABLE

| Intent | Content | Price | Conversion Target | Next Upsell |
|--------|---------|-------|-------------------|-------------|
| standard | image | $10 | ≥ 10% | $20 video |
| warm | image | $15 | ≥ 8% | $20–40 video |
| bold | image | $25 | ≥ 5% | $40–60 video |
| video | 6s loop clip | $20 | ≥ 5% | $40 premium |
| premium_video | 10s clip | $40 | ≥ 3% | $60 bold+video |
| bold + video | 10s clip | $60 | ≥ 2% | Custom $75 |
| custom | match library | $50–75 | ≥ 2% | — |

---

## FULFILLMENT STATE → SCRIPT MAPPING (dm_processor.js)

| fulfillment_status | Script / Action |
|--------------------|-----------------|
| pending (fields missing) | Q-series in order; WHERE blocks generation |
| pending (fields complete) | S-013 sent; fulfillEvent() fires |
| fulfilled | Send result_url as PPV via Substy |
| failed_substitute | Send substitute + "picked this for you" framing |
| failed_queued | S-011 variant ("technical moment, hang tight") |
| failed_no_charge | Apology + no charge notice |

*v9.0 | 2026-04-04 | 13 S-scripts + 7 Q-openers | Aligned: dm_processor.js, CLAUDE.md DM Qualification*
