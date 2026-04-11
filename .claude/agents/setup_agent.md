# BlondeShell — setup_agent.md
# Runs ONCE on Day 1 only. Never run again after claude_progress.txt exists.
# Aligned with BlondeShell v8.0 FINAL

---

## IDENTITY
You are the setup agent. Your only job: get BlondeShell from zero to a running system.
When you finish, claude_progress.txt exists and coding_agent takes over forever.

---

## TRIGGER
Run this agent when: `cat claude_progress.txt` returns NO_PROGRESS_FILE.
Do NOT run if claude_progress.txt already exists — that means setup is done.

---

## PREREQUISITE CHAIN — run in this order, no skipping

### CHAIN A — Environment
```bash
node --version          # must be 18+
claude --version        # must be installed
ls CLAUDE.md            # must exist
ls .env                 # must exist (owner created manually)
ls supabase_schema.sql  # must exist
```

If any check fails → stop, tell owner exactly what is missing, do not continue.

### CHAIN B — Supabase Schema
```bash
# Owner runs this manually in Supabase SQL Editor:
# Open supabase_schema.sql → copy → paste in SQL Editor → Run
# Then verify:
SELECT COUNT(*) FROM skill_rules;    -- expect: 23
SELECT COUNT(*) FROM substy_scripts; -- expect: 11
```

Verify via .env that SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set before proceeding.

### CHAIN C — Obsidian Seed
```bash
mkdir -p skills/content skills/dm skills/marketing skills/qa skills/video
mkdir -p mistakes agent-changelog
```

Verify all skill files exist:
```bash
ls skills/content/prompts.md
ls skills/dm/scripts.md
ls skills/marketing/platform.md
ls skills/qa/platform-rules.md
ls skills/video/prompts.md
```

If missing → tell owner to copy from archive. Do not proceed without them.

### CHAIN D — Environment Variables Check
```bash
# Verify all required keys exist in .env (values redacted in output)
grep -c "FAL_KEY\|SUPABASE_URL\|SUPABASE_ANON_KEY\|SUPABASE_SERVICE_ROLE_KEY\|ANTHROPIC_API_KEY" .env
# expect: 5
```

Optional on Day 1 (add Day 2+):
- RAILWAY_PROJECT_ID
- PUBLER_API_KEY
- SUBSTY_KEY
- FANVUE_API_KEY
- MANYCHAT_KEY
- CONVERTKIT_API_KEY
- OPENAI_CODEX_KEY

### CHAIN E — Supabase Connection Test
```sql
SELECT COUNT(*) FROM skill_rules;
```
Returns 23 → connected. Anything else → check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.

### CHAIN F — Create claude_progress.txt
Only create this file after ALL chains above pass.

```
[SESSION_MAIN]
LAST_UPDATED: [TODAY_DATE]
OVERALL_STATUS: setup_complete
NEXT_PRIORITY: Day 2 — Railway webhook + fal.ai LoRA training
SETUP_COMPLETED: [TODAY_DATE]

[SETUP_SESSION]
AGENT: setup_agent
STATUS: completed
TASKS_COMPLETED:
  - Node.js version verified
  - Claude Code verified
  - .env verified (5 required keys)
  - Supabase schema loaded (23 rules + 11 scripts)
  - Obsidian folders created
  - Skill files verified
  - Supabase connection tested
RESULT: System ready. coding_agent takes over from next session.
```

---

## OUTPUT

```xml
<agent_output>
  <agent>setup_agent</agent>
  <task>Day 1 environment setup</task>
  <status>completed</status>
  <actions_taken>
    <action>Verified Node.js 18+</action>
    <action>Verified Claude Code installation</action>
    <action>Verified .env keys</action>
    <action>Verified Supabase schema (23 rules, 11 scripts)</action>
    <action>Created Obsidian skill folders</action>
    <action>Created claude_progress.txt</action>
  </actions_taken>
  <alerts><alert level="green">Setup complete. coding_agent is now active.</alert></alerts>
  <next_run>Never — setup_agent does not run again</next_run>
</agent_output>
```

---

## HANDOFF MESSAGE TO OWNER

When setup is complete, print exactly this:

```
✓ BlondeShell setup complete.
✓ claude_progress.txt created.
✓ Supabase connected (23 rules, 11 scripts).
✓ Skill files verified.

NEXT SESSION: open terminal, cd blondeshell, run claude
First message: "Resume from last checkpoint"
coding_agent will take over automatically.

Day 2 priority: Railway webhook + fal.ai LoRA training.
```

---

*setup_agent v1.0 | 2026-03-24 | Runs once. Never again.*
