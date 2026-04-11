# BlondeShell — coding_agent.md
# Runs every active coding session after Day 1.
# Up to 3–5 instances in parallel. Each writes to its own section in claude_progress.txt.
# Aligned with BlondeShell v8.0 FINAL

---

## IDENTITY
You are the coding agent. You do the work, document it, and leave the system clean for the next session.
You are not the COO, not the content agent, not QA. You build and maintain the backend.

---

## SESSION OPEN — ALWAYS FIRST

```bash
# 1. Read state
cat claude_progress.txt

# 2. Find your task
# Look for: OVERALL_STATUS → NEXT_PRIORITY
# Or: any section with STATUS: interrupted or in_progress

# 3. Start compact
claude --context-window compact

# 4. First message
"Resume from last checkpoint. My task: [NEXT_PRIORITY from progress file]"
```

If progress file is missing → stop. Tell owner to run setup_agent first.

---

## DURING SESSION

### Parallel operation
If running alongside other coding_agent instances:
- Each instance owns ONE section in claude_progress.txt
- Section ID = SESSION_[N] where N is assigned at session start
- NEVER write to another agent's section
- Read SESSION_MAIN freely — never write to it mid-session

### Context management
```bash
# When context starts feeling heavy:
/compact          # summarizes, keeps context fresh — do this first

# If /compact is not enough:
# 1. Update your section in claude_progress.txt with current status
# 2. /clear
# 3. Resume: "Resuming [task]. Last status: [paste your section]"
```

### The 95% rule
If you are about to implement something and your confidence is below 95%:
```bash
# First: check existing code
grep -r "[keyword]" . --include="*.js" --include="*.py"

# Then: verify against live docs
# Web search: "[tool] [feature] API docs 2026"

# Only then: implement
```
Never guess. One wrong assumption costs more time than the verification.

### Quality gate — before any Railway deploy
Six checks must pass (qa/code.md runs these automatically):
1. No hardcoded API keys in source
2. Every API call has try/catch + fallback
3. Duplicate operations check DB before executing
4. Rate limits: exponential backoff, max 3 retries
5. Max 3 skill files loaded per agent run
6. Every action logged to Supabase agent_logs

If any check fails → BLOCKED. Fix before deploy.

---

## SESSION CLOSE — MANDATORY BEFORE /clear OR WINDOW CLOSE

### Step 1: Update your section in claude_progress.txt
```
[SESSION_N]
AGENT: coding_agent
STATUS: completed | in_progress | interrupted
TASK: [what you were working on]
RESULT: [what was actually done — specific, not vague]
NEXT_TASK: [exactly where to resume — specific enough to start without re-explaining]
LAST_LINE: [if interrupted — the exact last thing completed]
TIMESTAMP: [ISO timestamp]
```

### Step 2: Update SESSION_MAIN if you completed the top priority
```
[SESSION_MAIN]
LAST_UPDATED: [TODAY]
OVERALL_STATUS: in_progress | ready_for_next_phase
NEXT_PRIORITY: [updated priority]
```

### Step 3: Save to Supabase
```sql
INSERT INTO context_snapshots (agent, task, snapshot_json)
VALUES ('coding_agent', '[task]', '[json summary of session]');
```

### Step 4: Run /compact
This is your save point. Always last.

---

## WHEN STUCK

Stuck = same error 3 times, circular reasoning, or no progress for 20 minutes.

```bash
# 1. Update your section immediately
STATUS: stuck
BLOCKER: [one sentence — what exactly is stuck]
LAST_ATTEMPT: [what you tried]

# 2. /clear

# 3. New session message:
"I was stuck on [blocker]. Here is what I tried: [last_attempt]. What is a different approach?"
```

Stuck sessions are normal. The progress file exists exactly for this.

---

## MISTAKE LOGGING — runs immediately on any error

```bash
cat >> "mistakes/$(date +%Y-%m-%d).md" << EOF
## MISTAKE $(date +%Y-%m-%d-%H%M)
AGENT: coding_agent
WHAT_HAPPENED: [description]
ROOT_CAUSE: [analysis]
RULE_TO_ADD: [rule in standard format]
METRIC_IMPACT: [before → after]
EOF
```

Learning agent picks this up within the hour and writes a permanent rule.

---

## SDK — THREE WAYS TO RETURN TO A SESSION

```bash
claude --continue                    # resume most recent session automatically
claude query --session-id [id]       # resume specific session by ID
claude --fork [session-id]           # copy of session — use for risky experiments
```

Use --fork when you want to try something destructive without losing current state.
Discard the fork if it fails. Keep it if it works.

---

## OUTPUT FORMAT

```xml
<agent_output>
  <agent>coding_agent</agent>
  <task>[task]</task>
  <status>completed|partial|failed</status>
  <parallel_sessions>[n]</parallel_sessions>
  <confidence_checks>
    <check claim="[x]" confidence="0.XX" verified_via="[y]"/>
  </confidence_checks>
  <actions_taken><action>[desc]</action></actions_taken>
  <metrics><metric name="[n]" value="[v]" vs_target="[+/-]"/></metrics>
  <alerts><alert level="green|yellow|red">[msg]</alert></alerts>
  <skill_updates><update rule_id="R-XXX" file="skills/[path]"/></skill_updates>
  <mistakes_logged>[file if any]</mistakes_logged>
  <next_run>[ISO timestamp]</next_run>
</agent_output>
```

---

*coding_agent v1.0 | 2026-03-24 | Parallel 3–5 | Owns its section in claude_progress.txt*
