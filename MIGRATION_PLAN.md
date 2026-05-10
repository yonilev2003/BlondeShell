# BlondeShell Migration Plan — v5.2 → Hybrid (v5.2 + v3.1 ideas)
**Created**: 2026-05-10
**Branch**: `claude/blondshell-platform-review-uPVWA`
**Approach**: keep working JS codebase, layer v3.1 improvements on top. NO Python rewrite.

---

## 1. WHY HYBRID, NOT REWRITE

| Reason | Detail |
|---|---|
| Working code | 4,125 LOC across `lib/`, 38 npm scripts, Sprint 1 = 41/41 readiness, Fanvue upload + Publer scheduling tested live |
| Cost of rewrite | 4-6 weeks Python rewrite to recreate functionality that already runs on Railway. No new revenue, only risk. |
| v5.2 strengths v3.1 misses | Obsidian Second Brain, Brand Arc, vlog pipeline w/ Kling lipsync, C2PA signing, nsfwjs (~$18/mo savings), inspiration_engine, LinkedIn/Pinterest/Reddit tier rules already documented |
| v3.1 strengths worth adopting | Multi-persona schema, bandits, R2 backup, Israel firewall Check 2.5, chargeback monitor, versioned agent_memory w/ auto-rollback, 12h approval timeout, backup pool warming |

---

## 2. MAPPING: v3.1 component → v5.2 implementation

| v3.1 Python agent | v5.2 implementation | Action |
|---|---|---|
| Trend Scout (Haiku) | `agents/trends_agent.js` | KEEP, add Exa integration if missing |
| Content Director (Sonnet) | `lib/pipeline.js` + `agents/marketing_agent.js` | KEEP, add bandit-driven decisions |
| Prompt Engineer | `lib/buildPrompt.js` + `lib/inspiration_engine.js` | KEEP |
| Hook & Caption | `lib/hook_database.js` + `agents/content.md` | KEEP, upgrade to Thompson sampling |
| Asset Generator (3-checkpoint) | `lib/qa_gate.js` + `lib/generate_image.js` + `lib/generate_video.js` | EXTEND with Check 2.5 (Israel firewall) |
| Distributor | `lib/publer.js` + `lib/fanvue.js` + `lib/substy_client.js` | KEEP |
| Voice Synthesizer | `lib/voice.js` (ElevenLabs) | KEEP |
| Analytics | `agents/coo_agent.js` + `lib/supabase_content.js` | EXTEND with multi-snapshot windows |
| Loop Optimizer | `agents/learning_agent.js` + `lib/rule_inserter.js` | EXTEND with versioning + auto-rollback |
| Chargeback Monitor | **MISSING** | NEW: `agents/chargeback_agent.js` |
| Telegram approval bot | `lib/approvalWorkflow.js` (web/email today) | EXTEND with Telegram + 12h timeout |

Claude Code-native pieces that stay:
- `.claude/agents/*.md` — interactive subagents for owner sessions
- `skills/*.md` (incl. `skills/qa/platform-rules.md`) — loaded by agents at runtime
- `obsidian/blondeshell-brain/` — second brain (APIs, Rules, Patterns, Mistakes, Arcs)
- `starter-kit/.claude/commands/*` — slash commands (/retro, /resume, etc.)

---

## 3. DB SCHEMA DIFF (additions only — existing tables untouched)

Apply as new migration `supabase/migrations/20260510000001_v3_1_hybrid.sql`. All idempotent.

### Tables to ADD

```sql
-- Multi-persona (Persona #2 ready from day 1, but only blondshell active)
CREATE TABLE IF NOT EXISTS personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_name TEXT UNIQUE NOT NULL,
  persona_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  identity JSONB NOT NULL,
  visual JSONB NOT NULL,
  personality JSONB NOT NULL,
  voice_clone_id TEXT,
  lora_model_id TEXT,
  kyc_status TEXT DEFAULT 'personal',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO personas (system_name, persona_name, identity, visual, personality, status)
VALUES ('blondshell', 'Blond Shell', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'active')
ON CONFLICT (system_name) DO NOTHING;

-- Bandit state (Thompson sampling, replaces ad-hoc hook_database scoring)
CREATE TABLE IF NOT EXISTS bandit_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID REFERENCES personas(id),
  lever_name TEXT NOT NULL,        -- 'post_time' | 'hook_style' | 'content_category' | 'voice_emotion' | 'visual_aesthetic'
  arm_id TEXT NOT NULL,
  arm_metadata JSONB,
  alpha FLOAT DEFAULT 1.0,
  beta FLOAT DEFAULT 1.0,
  n_pulls INT DEFAULT 0,
  cumulative_reward FLOAT DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(persona_id, lever_name, arm_id)
);

-- Versioned agent memory with rollback support
CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID REFERENCES personas(id),
  agent_name TEXT NOT NULL,
  version INT NOT NULL,
  core_prompt TEXT,
  learnings JSONB DEFAULT '[]',
  do_not_repeat JSONB DEFAULT '[]',
  performance_score FLOAT,
  deployed_at TIMESTAMPTZ DEFAULT NOW(),
  superseded_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  UNIQUE(persona_id, agent_name, version)
);

-- Approval queue (12h timeout → queue, NOT auto-publish)
CREATE TABLE IF NOT EXISTS approval_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  persona_id UUID REFERENCES personas(id),
  preview_image_url TEXT,
  preview_caption TEXT,
  preview_hooks JSONB,
  sent_to_telegram_at TIMESTAMPTZ,
  decision TEXT,                   -- approved | rejected | queued | expired
  decision_at TIMESTAMPTZ,
  rejection_reason TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Asset archive (Cloudflare R2 mirror)
CREATE TABLE IF NOT EXISTS asset_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID REFERENCES personas(id),
  post_id UUID REFERENCES posts(id),
  supabase_path TEXT,
  r2_path TEXT,
  asset_type TEXT,                 -- image | video | voice
  hash TEXT,
  size_bytes BIGINT,
  archived_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backup account warming pool
CREATE TABLE IF NOT EXISTS backup_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID REFERENCES personas(id),
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  status TEXT DEFAULT 'warming',   -- warming | standby | active_backup | primary | banned
  warming_started_at TIMESTAMPTZ,
  device_id TEXT,
  ip_pool TEXT,
  email TEXT,
  current_followers INT,
  last_post_at TIMESTAMPTZ
);

-- Chargebacks (Fanvue refunds + Substy disputes)
CREATE TABLE IF NOT EXISTS chargebacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID REFERENCES personas(id),
  fan_id UUID,                     -- references subscribers, soft FK
  ppv_offer_id UUID,
  transaction_id TEXT,
  amount FLOAT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,            -- flagged | refunded_proactive | disputed | lost | won
  fee FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Pricing state (dynamic pricing control loop)
CREATE TABLE IF NOT EXISTS pricing_state (
  persona_id UUID PRIMARY KEY REFERENCES personas(id),
  current_sub_price FLOAT DEFAULT 10.0,
  current_ppv_standard FLOAT DEFAULT 10.0,
  current_ppv_premium FLOAT DEFAULT 18.0,
  current_ppv_personalized FLOAT DEFAULT 30.0,
  last_ppv_ratio FLOAT,
  last_adjusted_at TIMESTAMPTZ,
  adjustment_history JSONB DEFAULT '[]'
);

-- Performance scores (peer-normalized, replaces ad-hoc platform_scores math)
CREATE TABLE IF NOT EXISTS performance_scores (
  post_id UUID PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  raw_score FLOAT,
  peer_normalized_score FLOAT,
  percentile_rank FLOAT,
  velocity_1h FLOAT,
  velocity_6h FLOAT,
  conversion_score FLOAT,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  computed_with_n_snapshots INT
);

-- Metrics snapshots (multi-window, replaces single-shot platform_scores)
CREATE TABLE IF NOT EXISTS metrics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  snapshot_at TIMESTAMPTZ NOT NULL,
  hours_since_post FLOAT NOT NULL,
  views INT, likes INT, comments INT, saves INT, shares INT,
  click_through_to_fanvue INT,
  follower_delta INT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_metrics_post ON metrics_snapshots(post_id);
```

### Existing tables — light additions (no breaking changes)

```sql
-- Add persona_id to make existing tables multi-persona aware (default to blondshell)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS persona_id UUID REFERENCES personas(id);
UPDATE posts SET persona_id = (SELECT id FROM personas WHERE system_name='blondshell')
WHERE persona_id IS NULL;

ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS persona_id UUID REFERENCES personas(id);
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS rfm_recency INT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS rfm_frequency INT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS rfm_monetary FLOAT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS segment TEXT;  -- whale/active/new/at_risk/churned

ALTER TABLE revenue_events ADD COLUMN IF NOT EXISTS persona_id UUID REFERENCES personas(id);
```

### Tables intentionally NOT added (already covered by v5.2)

| v3.1 table | v5.2 substitute | Why |
|---|---|---|
| `trends` | `supabase/migrations/20260410000001_trends.sql` | Already exists |
| `audit_log` | `agent_logs` | Same purpose |
| `fans` | `subscribers` (extended) | Already canonical |
| `post_metadata` | columns on `posts` | Existing schema sufficient |
| `embeddings` (pgvector) | not needed yet | Defer until vector search proves valuable; adds extension complexity |
| `experiments` | `lib/ab_testing.js` table | Already exists |

---

## 4. CODE CHANGES — file-by-file

### Wave 1 — Critical, this week

| File | Change | Notes |
|---|---|---|
| `lib/qa_gate.js` | NEW: `israelFirewallCheck(imageUrl, caption)` — Claude vision prompt for Hebrew text, Israeli landmarks, religious symbols, Hebrew words in caption | Insert after `nsfwClassify`, before brand fit. Reject + alert owner if trace found. |
| `scripts/account_health_audit.mjs` | NEW: prompts owner to log into IG/TT/X and document strikes; writes `ACCOUNT_HEALTH.md` | Manual checklist, not automation. Phase 0 task #1. |
| `scripts/check_bios.mjs` | EXTEND: verify "21" appears (not "22"), warn if mismatch | Existing script returns empty data per Apr 18 notes; add age substring check. |
| `agents/strategy_agent.js` (or new `lib/birthday_arc.js`) | NEW: detect approaching `2026-06-01`, schedule countdown teasers Day -7..-1, birthday post Day 0 (Marilyn), bio flip 21→22 Day +1 | 22 days out. Critical not to miss. |

### Wave 2 — Foundation, weeks 1-2

| File | Change | Notes |
|---|---|---|
| `supabase/migrations/20260510000001_v3_1_hybrid.sql` | NEW: schema diff from §3 above | Run via Supabase SQL editor (per Apr 18 lesson learned re: drift) |
| `lib/r2_client.js` | NEW: Cloudflare R2 wrapper (`putAsset`, `getAsset`, `mirrorFromSupabase`) | Use `@aws-sdk/client-s3` with R2 endpoint |
| `lib/pipeline.js` | EXTEND: after generation success, fire-and-forget mirror to R2 + insert `asset_archive` row | Within 1h archive target |
| `lib/tier_enforcer.js` | NEW: hard-fails if `route(post.tier, post.platform)` returns block, regardless of agent decision | Defense-in-depth above `skills/qa/platform-rules.md` |
| `lib/approvalWorkflow.js` | EXTEND: `expires_at = NOW() + 12h`, scheduled job checks for expirations → status='queued' (NOT auto-publish) | Already simple; bolt onto existing approve/reject |

### Wave 3 — Optimization, weeks 2-4

| File | Change | Notes |
|---|---|---|
| `lib/bandits.js` | NEW: Thompson sampling on Beta(alpha, beta). API: `selectArm(persona, lever) → arm_id`, `recordReward(persona, lever, arm, reward)` | Replaces ad-hoc top-N from `lib/hook_database.js` for the 5 levers |
| `agents/chargeback_agent.js` | NEW: daily 14:00 IL cron. Reads Substy + Fanvue refund signals, auto-refunds <$25 with matching pattern, flags $25-100, builds dispute evidence ≥$100 | Wire into `webhook/server.js` cron section |
| `agents/learning_agent.js` | EXTEND: write new `agent_memory` version on each retro, track `performance_score`, auto-rollback if v(N) score < v(N-1) by ≥10% within 48h | Currently writes to `skill_rules`; add versioned wrapper |
| `lib/metrics_ingest.js` (or extend `agents/coo_agent.js`) | NEW: scheduled snapshots at 1h, 6h, 24h, 72h, 7d post-publish → `metrics_snapshots` | Replaces single-shot `platform_scores` write |
| `scripts/warmup_backup_pool.mjs` | NEW: daily organic posts to 5 warming accounts (2 IG, 2 TT, 1 X) | Different "personality" per account, no Blond Shell content |

### Wave 4 — Phase 0 leftovers

| File | Change | Notes |
|---|---|---|
| `scripts/train_lora.js` | EXECUTE existing stub. 20-30 hero refs from `assets/reference/hero/`, ~$5 on fal.ai | Generates `FAL_LORA_MODEL_ID` for `.env` |
| `lib/buildPrompt.js` | EXTEND: optional Flux+LoRA path alongside Seedream (A/B test) | Don't replace Seedream — A/B for 2 weeks |
| Twitter handle audit | MANUAL: confirm current active Twitter handle, retire `@ShellVibesAi` if exists, align with `@imtheblondeshell` family | One-time owner task |

---

## 5. OPEN DECISIONS FOR OWNER

| # | Question | Recommendation | Why |
|---|---|---|---|
| 1 | Substy: stay $99 Premium (current) vs downgrade $69 (v3.1)? | Stay $99 if Premium analytics or Elite features used; downgrade if not | Save $30/mo if features unused |
| 2 | Image gen: Seedream only (current) or A/B with Flux+LoRA (v3.1)? | A/B for 2 weeks after LoRA trained | Character consistency may improve, low cost ($5+marginal) |
| 3 | Email split: keep current Resend `onboarding@resend.dev` sender, or set up branded? | Stay default until Tier 2 brand deals | Defer $15/yr domain until needed |
| 4 | Backup KYC: same Yoni KYC + device/IP separation (v3.1) or stick current "ConvertKit backup" only? | Build the 5-account backup pool now | Hybrid C: real DR vs paper DR |
| 5 | Multi-persona: build schema multi-aware now (recommended) or stay single-persona until Persona #2 confirmed? | Schema multi-aware now (cheap), code stays single-active | Costs ~30 min, saves rewrites later |
| 6 | Did Apr 24 launch happen? Are accounts live? | Owner confirms before any Wave 1 work that touches live accounts | Unknown from `claude_progress.txt` (Apr 18 EOD) |

---

## 6. RISK REGISTER

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Schema migration breaks existing posts queries | Low | High | All ALTER TABLE use `ADD COLUMN IF NOT EXISTS`. Test on Supabase branch before main. |
| 12h timeout makes content backlog | Medium | Medium | Default-to-queue is intentional; queue dashboard to flag if >10 pending |
| R2 mirror lag causes asset loss if Supabase down | Low | Medium | Mirror is best-effort, fire-and-forget; Supabase Storage already redundant |
| Bandits cold-start with weak priors | High | Low | Initialize alpha=1, beta=1 (uniform); fall back to `hook_database.js` top-N for first 30 days |
| Israel firewall false positives reject good content | Medium | Low | Log all rejections; tune prompt over first week |
| Birthday arc misses June 1 | Low | High | Implement Wave 1, lock the cron 7 days out |

---

## 7. WHAT WE ARE EXPLICITLY NOT DOING

- ❌ Rewriting JavaScript to Python
- ❌ Replacing Seedream with Flux as default (A/B only)
- ❌ Removing Obsidian Second Brain
- ❌ Adopting v3.1's reduced platform list (we keep LinkedIn/Pinterest/Reddit)
- ❌ Replacing nsfwjs with Google SafeSearch (nsfwjs saves ~$18/mo, works)
- ❌ Migrating to FastAPI (Express webhook works)
- ❌ Adding pgvector (defer until needed)
- ❌ Switching Kling v3 → Kling 2.0 (v3 is newer)

---

## 8. EXECUTION ORDER (suggested)

1. Owner answers §5 open decisions
2. Owner runs **account health audit** (Wave 1 task #1) — blocks any post that touches live accounts
3. Wave 1 code: Israel firewall, bio age check, birthday arc → ~1-2 days
4. Wave 2 schema migration + R2 + tier enforcer + 12h timeout → ~3-4 days
5. Wave 3 bandits + chargeback agent + multi-snapshot + backup pool → ~5-7 days
6. Wave 4 LoRA training + Twitter audit → ~1 day

Total: ~2 weeks of focused work. Each wave shippable independently.

---

## 9. CLAUDE.md UPDATE

After Waves 1-3 complete, update `CLAUDE.md` v5.2 → v5.3 with:
- Persona id awareness in agent routing table
- Reference to bandits as decision engine for Content Director
- Reference to `lib/r2_client.js` in DR section
- Israel firewall as standing Check 2.5 in QA gate flow
- Birthday arc trigger as one-shot before June 1

Keep Obsidian section, Brand Arc / strategy_agent, vlog pipeline — those are v5.2 strengths.

---

*End of plan. Owner approval required before execution begins.*
