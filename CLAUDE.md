# BlondeShell — CLAUDE.md v5.2
# Full Autonomy Architecture | 2026-04-18

## SECOND BRAIN — Obsidian Vault
```
obsidian/blondeshell-brain/
  APIs/         — API references (load on demand via lib/obsidian.js)
    fanvue.md   — Fanvue v2025-06-26
    publer.md   — Publer v1
  Rules/        — Learned rules (R-XXX.md), auto-inserted by learning_agent
  Patterns/     — Weekly analytics + tool evaluations
  Arcs/         — Brand storyline arcs
  Mistakes/     — Error logs (YYYY-MM-DD.md)
  Changelog/    — Weekly system changelog
```
Load via `import { loadAPIReference, readNote } from './lib/obsidian.js'`.
Keep CLAUDE.md thin. Details live in the vault.

## MISSION
Fully autonomous AI influencer. Zero human intervention for daily operations.
Owner role: quarterly strategic goals + withdraw money.
North Star: Fanvue conversions (not impressions).
Month 1: 300 subs / $1,000 DM PPV / 5M impressions
Month 12: $1,000,000/month net revenue, margin ≥65%
Fanvue fee: 20% everywhere. Substy: $99/mo + 8.5%.

## 5 PILLARS
1. Webhook-driven conversation → content (DM → PPV generation)
2. End-to-end publishing pipeline (inspiration → generate → QA → route → schedule)
3. Strategic Brand Agent (arcs, collabs, annual planning)
4. Learning Loop → Obsidian Second Brain (rules, patterns, audit trail)
5. Dynamic monetization + CRM (segmentation, pricing, win-back)

## SESSION START
```bash
cat claude_progress.txt 2>/dev/null || echo "NO_PROGRESS_FILE"
claude --context-window compact
```

## PARALLELISM — MANDATORY
Spawn ALL agents in ONE message. Batch ALL reads/writes. NEVER sequential after init.

## AGENT ROUTING
| Task | Agent | Mode |
|------|-------|------|
| Daily digest + alerts | coo.md | Interactive |
| Content pipeline | content.md + pipeline.js | Headless |
| Content QA | qa.md → qa_gate.js | Headless auto |
| Platform QA | qa/[platform].md | Headless |
| DM + Substy oversight | dm.md | Headless |
| Scheduling + publishing | marketing.md → pipeline.js | Headless |
| Learning loop + Obsidian | learning.md → rule_inserter.js | Headless |
| Video library + vlogs | video.md → vlog.js | Headless |
| Revenue + CRM | revenue_agent.js → crm.js | Headless |
| Strategy + Brand Arcs | strategy_agent.js | Headless |
| Trend scanning | trends.md | Headless |
| Active coding | coding_agent.md | Headless parallel |

## CONTENT ENGINE — Inspiration-Driven (no fixed stacks)
```
Brand Arc (strategy_agent) → Inspiration Engine → Creative Brief → Dynamic Prompt → Generate → QA Gate → Route → Schedule
```
- NO fixed stacks (beach/gym/street/home are DEAD)
- Inspiration from: real model analysis + trends + analytics + Brand Arc context
- Content types: photos, short clips, vlogs (arc-driven), voice notes, PPV

## CHARACTER
```
Name: Blonde Shell (@blondeshell / @itstheblondeshell)
Age: 21 (born June 1, 2004) | Location: LA, California
Persona: Gen Z, playful, chronically online, chaotic energy
Physical: Platinum blonde, green eyes, athletic/toned, 58kg, 32B
Interests: Fitness, gaming (Valorant, Fortnite, Sims, Stardew, Minecraft)
Music: Taylor Swift, Doja Cat, Sabrina Carpenter, lo-fi
Voice: ElevenLabs clone | Links: beacons.ai, Throne wishlist
```

## CHARACTER CONSISTENCY — seedream v4.5
```
Layer 1: seedream v4-5 base model
Layer 2: IP-Adapter FaceID → face consistency via reference_images table
Layer 3: 30-image hero reference dataset (assets/reference/hero/)
Layer 4: Top 5 refs by context + all hero images → every call
< 0.85 → REJECT | < 0.85 x2 → yellow alert | < 0.80 → HARD STOP
```
Image: fal-ai/seedream-v4-5 | Video: fal-ai/kling-video/v3/standard/image-to-video
Voice: ElevenLabs Starter | Lip-sync: Hedra

## CONTENT TIERS
| Tier | Platforms | Rule |
|------|-----------|------|
| T1 — SFW | IG, TikTok, YT, Threads, LinkedIn, Twitch | 30%+ visual distance from T2 |
| T2 — Suggestive | Twitter/X, Reddit ONLY | Full definition: skills/qa/platform-rules.md |
| T3 — Fanvue | Fanvue ONLY | Free-to-sub + PPV via Fanvue API |

Safety:
- HARD STOP: age ambiguity → REJECT + delete + owner alert
- TikTok AI label ON always. Instagram Meta AI label ON + "AI-generated" in bio always.

## PUBLISHING STACK
- **Fanvue**: Official API v2025 (OAuth 2.0 PKCE) — media vault, mass messaging, scheduled posts
- **Social (SFW)**: Publer API — Instagram, TikTok, Twitter, Reddit, Threads, YT, LinkedIn
- **DMs**: Substy ($99/mo Premium + 8.5%) — AI handles all DMs autonomously
- **Substy automation**: Playwright service on Hetzner VPS (DM analytics, CRM data, settings)

## VLOG PIPELINE (Arc-Driven)
```
Brand Arc → Script (Claude Haiku) → Narration (ElevenLabs) → Start Frames (Seedream)
→ Video Clips (Kling 3.0) → Talking Head (Hedra) → Stitch (ffmpeg) → 30-60s vertical
```
Vlogs derive from current Strategic Brand Arc. Never random.

## LEARNING LOOP → OBSIDIAN SECOND BRAIN
```
Mistake/Pattern → learning_agent → rule_inserter.js
  → obsidian/blondeshell-brain/Rules/R-XXX.md (audit trail)
  → Supabase skill_rules (runtime)
  → skills/*.md (agent pickup)
```
HIGH confidence: auto-insert. MEDIUM/LOW: flag for owner review.

## CRM SEGMENTS
| Segment | Criteria | PPV Price | Action |
|---------|----------|-----------|--------|
| Whale | Top 10% spend | $35-50 | Premium + exclusive + voice notes |
| Active | Engaged last 7d | $10-25 | Standard |
| New | First 7 days | $5 discount | Onboarding funnel |
| At Risk | 7+ days silent | — | Win-back DM (max 2/cycle) |
| Churned | 30+ days | — | Archive |

## FINANCIAL CONSTANTS
```python
FANVUE_FEE=0.20 | SUBSTY_ELITE=0.085 | SUBSTY_MONTHLY=99
BREAKEVEN_SUBS=60
```

## 90-DAY LAUNCH STRATEGY
| Phase | Days | Platforms | Posts/day | Target |
|-------|------|-----------|-----------|--------|
| Warm Up | 1-30 | TikTok + Reddit | 2-3 | ID winning formats |
| Scale | 31-60 | + Instagram | 4-6 | 500K-1M impressions |
| Viral | 61-90 | All active | 6-8 | 3-10M impressions |

## RED ALERTS — STOP EVERYTHING
| Trigger | Action |
|---------|--------|
| Age-ambiguous content | HARD STOP. Delete. Owner alert. |
| Fanvue content flagged | PAUSE all posts. Owner login. |
| Face similarity < 0.80 | STOP generation. Add hero refs. |
| API key compromised | Rotate ALL .env. Update Railway. |
| Platform ban | Activate ConvertKit backup. |
| Claude API > $150/mo | Token audit immediately. |

## DM QUALIFICATION — 5W+H
| Field | Question | Required? |
|-------|----------|-----------|
| WHO | Who appears? | Yes |
| WHAT | What is happening? | Yes |
| WHERE | Location | Yes (blocks generation) |
| WHEN | Time of day / lighting | Yes |
| WHY | Mood/vibe | Yes |
| HOW | Camera angle, outfit | Optional |
Timeout: 4h → "surprise me" fallback.

## CRON SCHEDULE (UTC)
| Time | Agent | Purpose |
|------|-------|---------|
| 0 3 | revenue_agent | CRM + revenue |
| 0 4 | pipeline | Daily content batch |
| 0 6 | learning_agent | Rule analysis |
| 0 8 Mon | inspiration_engine | Weekly model scrape |
| 0 10 | marketing_agent | Scheduling |
| 0 12 | coo_agent | Daily digest |
| 0 13 | trends_agent | Trend scan |
| 0 15 MWF | vlog_pipeline | Arc-driven vlogs |
| 0 19 | learning_agent | Evening analytics |
| */2h | viral_check | Viral detection |

## API KEYS
Active: ANTHROPIC, FAL, SUPABASE_*, FANVUE_*, PUBLER, RESEND, SUBSTY_SERVICE_*, ELEVENLABS, HEDRA
On the side: MANYCHAT, CONVERTKIT, OPENAI_CODEX, TWITTER_COOKIES_B64

## WHEN STUCK ON API
Load from vault first (APIs/*.md). If unclear:
- Fanvue → `api.fanvue.com/docs` → Ask AI
- Publer → `publer.com/docs` → Ask AI
- COO digest flags any unresolved API issues

*v5.2 | 2026-04-18 | Obsidian vault is source of truth | State: claude_progress.txt + Supabase*
