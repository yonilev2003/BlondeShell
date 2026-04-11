# Skill File: qa/platform-rules
# Loaded by: qa agent, content agent, coding agent (pre-publish checks)
# Last updated: 2026-04-04 (v9.0 — full per-platform rules added)

---

## T2 CONTENT DEFINITION — SYSTEM STANDARD
## Added 2026-03-24 by COO (v8.0) | Confirmed v9.0 2026-04-04
## Loaded by: content agent, qa agent, every generation call

### Purpose
T2 content represents suggestive, aesthetically styled imagery that may imply attractiveness
or flirtation but does not depict sexual activity, explicit nudity, or sexual stimulation.
Visual framing must remain consistent with fashion, lifestyle, or fitness photography.

### Core Principle
The intent of the image must read as modeling, lifestyle, or athletic presentation — not sexual
interaction. If the image could reasonably be interpreted as sexual stimulation, arousal, or
explicit sexual invitation → REJECT.

### Allowed Visual Characteristics
- Partial upper-body exposure (topless from waist up, side coverage, or implied framing)
- Minimal clothing: bikinis, lingerie-style fashion, sportswear
- Confident or flirtatious posing typical of fashion photography
- Natural body posture emphasizing aesthetics rather than sexual action
- Environmental contexts: beach, gym, home, lifestyle settings
- HARD RULE: lower body must always remain clothed

### Self-Touch Policy
PERMITTED:
- Hand in hair
- Touching head or neck
- Adjusting clothing
- Resting hand on hip
- Hand lightly resting on thigh (above clothing)
- Natural modeling gestures

PROHIBITED:
- Touching breasts, nipples, buttocks, or genital area
- Gestures suggesting stimulation or arousal
- Poses designed to simulate sexual touching

### Pose Constraints
ALLOWED: standing, walking, stretching, athletic movement, casual leaning, sitting,
  relaxed posture, fashion or editorial poses, gym or beach poses typical of fitness photography

DISALLOWED: explicit sexual posing, spread-leg poses intended to expose genital area,
  simulated sexual acts, positions clearly designed to mimic sexual activity

### Hard Rejection Criteria — automatic fail
- Visible genitals or genital exposure
- Visible nipples if platform rules forbid them
- Explicit sexual activity
- Self-touch of intimate areas
- Sexualized camera framing focused on genital areas
- Content implying sexual acts or stimulation
- Any depiction that could be interpreted as involving a minor

### Platform Compliance
Before publishing T2 content, the destination platform rules must be verified below.
Reddit and Twitter/X are the ONLY T2-permitted platforms.

### AI Disclosure
All T2 content follows the same AI disclosure rules as T1, including platform-required
AI labels and profile disclosure.

### Agent Pass Criteria — ALL 5 must be true
1. Lower body remains clothed
2. No explicit sexual action or stimulation
3. Self-touch (if present) is neutral and non-sexual
4. The pose reads as fashion, lifestyle, or fitness
5. The image passes the reasonable viewer test

If any fail → REJECT or downgrade content tier.

CONFIDENCE: HIGH
VERIFIED_VIA: v8.0 owner definition 2026-03-24 | confirmed v9.0 2026-04-04
EXPIRES: never (update only with owner approval)

---

## PER-PLATFORM CONTENT RULES

---

## PLATFORM: FANVUE
Tier allowed: T3 only (also T2, T1 as upsell funnel)
Content type: free-to-sub feed + PPV via Substy

### Allowed
- T3 explicit content (full nudity, sexual content per Fanvue policy)
- T2 suggestive content (funnel / teaser posts)
- T1 SFW content (brand, lifestyle, engagement)
- PPV content gated via Substy integration
- DM-generated custom content (5W+H qualification required)

### Prohibited
- Any content where age could be ambiguous → apply reasonable person test: would a reasonable
  person think the subject could be under 21? If YES or UNCERTAIN → REJECT immediately
- Sexual content involving non-consenting scenarios
- Content involving third parties without consent documentation
- Watermarks from competing platforms

### Age Safety
RULE: reasonable person test on every T3 asset before upload
FAIL CONDITION: any doubt → REJECT + delete + owner alert
CONFIDENCE: HIGH | EXPIRES: never

### Disclosure
- No AI disclosure required by Fanvue policy (reverify quarterly)
- Profile must be accurate per Fanvue KYC

### Fulfillment States (DM PPV)
- fulfilled: delivered on time, payment processed
- failed_no_charge: failed, subscriber not charged
- failed_substitute: alternative delivered, partial charge
- failed_queued: delayed, subscriber notified

---

## PLATFORM: X / TWITTER
Tier allowed: T2 only (T1 also permitted)
Content type: suggestive lifestyle, fashion, fitness, teaser

### Allowed
- T2 suggestive content (full T2 definition above applies)
- T1 SFW content
- Explicit content (T3) ONLY if: adult content label applied, account verified 18+,
  and content meets Twitter adult content policy — DO NOT post T3 without manual owner review

### Prohibited
- T3 content posted without adult label and owner sign-off
- Non-consensual imagery
- Content depicting minors (zero tolerance)
- Spam or coordinated inauthentic behavior

### QA Checks Before Post
1. T2 pass criteria: all 5 pass?
2. Image does not show nipples (default T2 rule — covered or implied only)
3. No genitals visible
4. Caption is not explicitly sexual (suggestive is fine)
5. AI disclosure: not required by platform but do not claim human origin if asked

### Posting Cadence
- Max 4 T2 posts/day to avoid suppression
- Engagement bait (polls, questions) on T1 posts to drive follows

---

## PLATFORM: REDDIT
Tier allowed: T2 only (T1 also permitted)
Content type: suggestive lifestyle, fitness, fashion — community-matched

### Allowed
- T2 suggestive content posted to NSFW-tagged subreddits
- T1 SFW content in SFW subreddits
- T3 ONLY in adult subreddits that explicitly allow it AND owner has manually reviewed
  the subreddit rules — DO NOT auto-post T3 to Reddit

### Prohibited
- Posting T2/T3 to non-NSFW subreddits
- Content that violates subreddit-specific rules (always check sidebar rules before first post)
- Vote manipulation, astroturfing, ban evasion
- Linking directly to Fanvue in posts (use linktree / profile bio only, or subreddit allows it)
- Content depicting minors — zero tolerance

### QA Checks Before Post
1. Target subreddit is NSFW-flagged (for T2 posts)?
2. Subreddit rules reviewed and content matches them?
3. T2 pass criteria: all 5 pass?
4. No nipple exposure unless subreddit explicitly permits
5. Title follows subreddit conventions (no keyword spam)
6. Fanvue link placement complies with subreddit self-promotion rules

### Subreddit Strategy
- Maintain karma > 100 per account before posting to gated subreddits
- Do not post identical image to more than 3 subreddits in 24h (spam detection)
- Vary captions per subreddit

---

## PLATFORM: TIKTOK
Tier allowed: T1 ONLY
Content type: SFW lifestyle, humor, fitness, behind-the-scenes, trending audio

### Allowed
- T1 SFW content only — no exceptions
- Educational, lifestyle, fitness, fashion, humor content
- Trending audio (verify rights before use)
- Duets, stitches, replies if on-brand

### Prohibited
- Any T2 or T3 content — immediate account risk
- Content without AI disclosure label when AI-generated
- Nudity, sexual content, or suggestive posing beyond standard fashion norms
- Violence, dangerous challenges, misinformation
- Copyrighted audio without TikTok commercial license

### Mandatory Checks — every upload
1. AI-generated toggle ON in upload flow (programmatic verify required) — R-018
2. Content is strictly T1 (no suggestive posing, no partial exposure)
3. Audio is licensed or original
4. Caption contains no claims that could be read as misleading
5. "AI-generated" or "AI creator" mentioned in video or caption if depicting a person

### Suppression Risks
- Untagged AI content → shadow suppression (not ban, but reach killed)
- T2 content uploaded → account warning → escalation to ban
- Posting frequency: 1–3/day recommended, beyond 5/day risks spam flag

---

## PLATFORM: INSTAGRAM
Tier allowed: T1 ONLY
Content type: SFW lifestyle, fashion, fitness, aesthetic, Reels, Stories

### Allowed
- T1 SFW content only — no exceptions
- Reels, feed posts, Stories, Carousels
- Fashion, lifestyle, gym, travel content typical of professional creators
- Paid partnership labels where applicable

### Prohibited
- Any T2 or T3 content — violates Instagram Community Guidelines
- Visible nipples (gender-neutral nudity policy — applies to AI-generated content equally)
- Sexual content, implied nudity beyond swimwear
- AI-generated content without proper disclosure

### Mandatory Checks — every upload
1. Meta AI label toggle ON in upload flow — R-019
2. Bio contains "AI-generated" text — verify before every session
3. Content is strictly T1 — no suggestive posing beyond standard swimwear/fitness norms
4. No nipple visibility (including through fabric if clearly visible)
5. Caption includes "AI" or "AI creator" reference on character-reveal posts
6. Paid partnership label if monetized collaboration

### Suppression Risks
- Untagged AI content → C2PA auto-detection → label applied without consent → trust damage
- T2 content → content removal → account strike
- Repeated violations → account disabled

---

## PLATFORM: LINKEDIN
Tier allowed: T1 ONLY — professional/business subset
Content type: AI creator brand narrative, business insights, creator economy commentary

### Allowed
- Professional brand story content (building an AI creator business)
- Insights on creator economy, AI tools, automation
- Milestone announcements (follower counts, revenue milestones — no explicit figures unless strategic)
- Behind-the-scenes of AI content creation process (tool stack, workflow)
- Thought leadership on synthetic media and ethics

### Prohibited
- Any T2 or T3 content — zero tolerance, immediate professional brand damage
- Overly casual or personal content unrelated to business narrative
- Fanvue links or explicit creator platform promotion
- Misleading claims about AI capabilities

### Tone
- Professional, curious, founder-voice
- Frame BlondeShell as a tech-forward content business, not an adult platform
- Target audience: tech founders, creators, AI enthusiasts, media professionals

### QA Checks Before Post
1. Content is 100% professional / business-appropriate
2. No platform mentions that reveal adult content business (Fanvue, Substy)
3. No suggestive imagery — strictly portrait or abstract/conceptual visuals
4. Caption is polished and on-brand professional voice

---

## PLATFORM: PINTEREST
Tier allowed: T1 ONLY — aesthetic/visual subset
Content type: SFW aesthetic, fashion, fitness, lifestyle mood boards, visual inspiration

### Allowed
- T1 SFW fashion, lifestyle, beauty, fitness content
- Aesthetic mood boards and visual collections
- Infographics and styled content
- Linking to SFW blog or landing pages

### Prohibited
- Any T2 or T3 content — Community Guidelines violation
- Nudity beyond standard swimwear in appropriate context
- Spam pinning, keyword stuffing in descriptions
- Misleading links (bait-and-switch to adult content)

### QA Checks Before Post
1. Content is T1 and aesthetically consistent with Pinterest style norms
2. No suggestive posing beyond standard swimwear / fitness norms
3. Link destination (if any) is SFW — no redirect to Fanvue or adult platforms
4. Description is accurate and keyword-relevant (not spam)
5. AI disclosure: not required by Pinterest policy — reverify quarterly

---

## TIER → PLATFORM ROUTING MATRIX

| Tier | Fanvue | X/Twitter | Reddit | TikTok | Instagram | LinkedIn | Pinterest |
|------|--------|-----------|--------|--------|-----------|----------|-----------|
| T1   | ✓      | ✓         | ✓      | ✓      | ✓         | ✓        | ✓         |
| T2   | ✓      | ✓         | ✓      | ✗      | ✗         | ✗        | ✗         |
| T3   | ✓      | owner only | owner only | ✗ | ✗        | ✗        | ✗         |

owner only = requires manual owner review before any T3 post on that platform

---

## STANDING RULES (carry forward from v8.0)

## RULE [R-018] — Added 2026-03-23
CONDITION: every TikTok upload
NEW RULE: AI-generated toggle MUST be ON before upload. Verify programmatically.
CONFIDENCE: HIGH | VERIFIED_VIA: TikTok policy March 2026 | EXPIRES: reverify quarterly

## RULE [R-019] — Added 2026-03-23
CONDITION: every Instagram upload
NEW RULE: Meta AI label toggle ON. Bio must contain "AI-generated". C2PA auto-flags unlabeled AI.
CONFIDENCE: HIGH | VERIFIED_VIA: Meta policy March 2026 | EXPIRES: reverify quarterly

## RULE [R-020] — Added 2026-03-23
CONDITION: every Fanvue content submission
NEW RULE: reasonable person test — would a reasonable person flag as under 21? YES/UNCERTAIN → REJECT + delete + owner alert.
CONFIDENCE: HIGH | VERIFIED_VIA: Fanvue KYC policy | EXPIRES: never

## RULE [R-021] — Added 2026-04-04
CONDITION: any T2 or T3 content routing decision
NEW RULE: agent must check TIER → PLATFORM ROUTING MATRIX before every publish action.
  T2 → TikTok, Instagram, LinkedIn, Pinterest = HARD BLOCK, do not publish.
  T3 → X or Reddit = flag to owner, hold queue, await explicit approval.
CONFIDENCE: HIGH | VERIFIED_VIA: v9.0 owner definition | EXPIRES: never

## RULE [R-022] — Added 2026-04-04
CONDITION: any platform policy check
NEW RULE: all platform policies reverify quarterly (Jan, Apr, Jul, Oct).
  Log reverification date and result to skills/qa/platform-rules.md header.
CONFIDENCE: HIGH | VERIFIED_VIA: standard compliance practice | EXPIRES: never
