# BlondeShell — CLAUDE.md v4.0
# Aligned with v9.0 FINAL | Details live in skills/ and agents/

## MISSION
Orchestration brain. Maximum automation, minimum owner time.
Month 1: 300 subs / $1,000 DM PPV / 5M impressions
Month 12: $1,000,000/month net revenue, margin ≥65%
Fanvue fee: 20% everywhere. No exceptions.
Agents week X+1 > week X. Always.

## SESSION START — ALWAYS FIRST
```bash
cat claude_progress.txt 2>/dev/null || echo "NO_PROGRESS_FILE"
# NO FILE → setup_agent.md (Day 1 only)
# FILE EXISTS → coding_agent.md
claude --context-window compact
```

## PARALLELISM — MANDATORY
```bash
claude -p ".claude/agents/coding_agent.md" --task "[task_1]" &
claude -p ".claude/agents/coding_agent.md" --task "[task_2]" &
claude -p ".claude/agents/coding_agent.md" --task "[task_3]" &
wait
```
Spawn ALL agents in ONE message. Batch ALL reads/writes. NEVER sequential after init.

## AGENT ROUTING
| Task | Agent | Mode |
|------|-------|------|
| Daily digest + alerts + Sunday | coo.md | Interactive |
| Image/video generation | content.md | Headless parallel |
| Content QA | qa.md | Headless parallel |
| Platform QA | qa/[platform].md | Headless parallel |
| DM + Substy oversight | dm.md | Headless |
| Analytics + virality | marketing.md | Headless |
| Learning loop + Obsidian | learning.md | Headless |
| Loop video library | video.md | Headless |
| Pre-deploy code QA | qa/code.md | Headless |
| Opportunities | opportunities.md | Interactive/Headless |
| Session init — Day 1 only | setup_agent.md | Interactive |
| Active coding (3–5 parallel) | coding_agent.md | Headless parallel |

## TOKEN EFFICIENCY
File search = bash only, zero tokens:
```bash
grep -r "RULE" ./skills/ --include="*.md"
cat skills/content/prompts.md
```
Skill loading: grep → SELECT skill_path ORDER BY relevance_score LIMIT 3 → max 3 files, 500 tokens each.
Context: INSERT INTO context_snapshots before /clear. SELECT snapshot_json after /clear.

## 95% CONFIDENCE RULE
grep codebase → web search docs → confidence > 95%? implement : flag_to_owner.
```xml
<confidence_check>
  <claim>[what]</claim><verified_via>[source]</verified_via>
  <confidence>0.XX</confidence><action>implement|flag_to_owner</action>
</confidence_check>
```

## CONTENT TIERS
| Tier | Platforms | Rule |
|------|-----------|------|
| T1 — SFW | IG, TikTok, YT, Threads, LinkedIn, Twitch | 30%+ visual distance from T2 |
| T2 — Suggestive | Twitter/X, Reddit ONLY | Full definition: skills/qa/platform-rules.md |
| T3 — Fanvue | Fanvue ONLY | Free-to-sub + PPV via Substy |

Safety:
- HARD STOP: age ambiguity → REJECT + delete + owner alert
- TikTok AI label ON always. Instagram Meta AI label ON + "AI-generated" in bio always.

## CHARACTER CONSISTENCY — seedream v4.5 stack
```
Layer 1: seedream v4-5 base model
Layer 2: IP-Adapter FaceID → face consistency via reference_images table
Layer 3: 30-image hero reference dataset (assets/reference/hero/)
Layer 4: Top 5 refs by setting+tier match + all hero images → every call
< 0.85 → REJECT | < 0.85 x2 → yellow alert | < 0.80 → HARD STOP
```
Image model : fal-ai/seedream-v4-5
Video model : fal-ai/kling-video/v2/standard/image-to-video
Setup       : node scripts/setup_reference_dataset.js (replaces train_lora.js)

## FINANCIAL CONSTANTS
```python
FANVUE_FEE=0.20 | SUBSTY_STARTER=0.15 | SUBSTY_PRO=0.10 | SUBSTY_ELITE=0.085
THE_PIT_EXPECTED=430 | THE_PIT_HARD_CAP=500 | BREAKEVEN_SUBS=60
```

## RED ALERTS — STOP EVERYTHING
| Trigger | Action |
|---------|--------|
| Age-ambiguous content | HARD STOP. Delete. Owner alert. |
| Fanvue content flagged | PAUSE all posts. Login manually. |
| Face similarity < 0.80 | STOP generation. Add new hero refs + re-run setup_reference_dataset. |
| API key compromised | Rotate ALL .env. Update Railway. |
| Platform ban | Activate ConvertKit backup. |
| Pit approaching $500 | Freeze all non-essential spend. |
| Claude API > $150/mo | Token audit immediately. |

## OUTPUT FORMAT
```xml
<agent_output>
  <agent>[name]</agent><task>[task]</task><status>completed|partial|failed</status>
  <actions_taken><action>[desc]</action></actions_taken>
  <metrics><metric name="[n]" value="[v]" vs_target="[+/-]"/></metrics>
  <alerts><alert level="green|yellow|red">[msg]</alert></alerts>
  <skill_updates><update rule_id="R-XXX" file="skills/[path]"/></skill_updates>
  <next_run>[ISO timestamp]</next_run>
</agent_output>
```

## LEARNING LOOP
Every mistake → log to mistakes/YYYY-MM-DD.md → learning agent writes rule → skill file updated
→ Supabase INSERT into skill_rules → all future runs fire the rule automatically.

## DM QUALIFICATION — 5W+H (REQUIRED BEFORE PPV GENERATION)
| Field | Question | Required? |
|-------|----------|-----------|
| WHO   | Who appears? (BlondeShell only / with elements) | Yes |
| WHAT  | What is happening? | Yes |
| WHERE | Location: beach/gym/home/travel/other | Yes |
| WHEN  | Time of day / lighting / season | Yes |
| WHY   | Mood/vibe: flirty/athletic/cozy/bold | Yes |
| HOW   | Camera angle, outfit specifics | Optional |

Rules:
- WHERE missing → Substy sends qualification question. Generation BLOCKED.
- Timeout: 4h after first question → "surprise me" fallback with defaults.
- All fields stored in dm_events.qualification_* columns.
- Fulfillment states: fulfilled / failed_no_charge / failed_substitute / failed_queued

*v4.0 | 2026-04-04 | Full docs: skills/ | Agents: .claude/agents/ | State: claude_progress.txt + Supabase*
