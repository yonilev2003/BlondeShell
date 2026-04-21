# Claude Code Starter Kit — Yoni's Learning-Loop Setup

A drop-in configuration that fixes four pain points:

| Pain | Fix |
|---|---|
| Context loss between sessions | `CLAUDE.md` + `claude_progress.txt` + `context-hydrator` subagent |
| Repeated mistakes | `LESSONS.md` + `lesson-extractor` subagent + `Stop` hook |
| Parallel session conflicts | Git worktree workflow via `/parallel` command |
| Latency / token waste | Per-agent model routing (Haiku for extraction, Sonnet default) |

---

## Install (per project)

```bash
cd your-project/
# Copy everything from this kit into the project root
cp -r starter-kit/. .
chmod +x scripts/*.sh
# Restart Claude Code (agents are loaded at startup only)
claude
```

For global (all projects), copy `.claude/agents/` and `.claude/commands/` to `~/.claude/` instead. Project-level overrides global on name collision.

---

## What each file does

### Context layer
- **`CLAUDE.md`** — Project instructions. Loaded into every session's system prompt. Keep it ≤200 lines.
- **`LESSONS.md`** — Persistent mistakes/pitfalls log. Referenced from CLAUDE.md.
- **`claude_progress.txt`** — Rolling session state. Updated at each `Stop`, hydrated at each `SessionStart`.

### Subagents (`.claude/agents/`)
- **`context-hydrator`** (Haiku) — Runs on session start. Reads `claude_progress.txt` + `LESSONS.md` + `git status` and returns a compact brief. Keeps startup tokens low.
- **`lesson-extractor`** (Haiku) — Reads the current session transcript, extracts any mistake/cause/fix pattern, appends to `LESSONS.md`. Cheap, dedupes.
- **`code-reviewer`** (Sonnet, read-only) — Reviews uncommitted diff before commit. Catches the same category of bugs you've logged in `LESSONS.md`.

### Slash commands (`.claude/commands/`)
- **`/plan`** — Forces Goal→Plan→Execution→Result structure before heavy work.
- **`/ship`** — lint → typecheck → test → commit → PR.
- **`/retro`** — Manually trigger `lesson-extractor`.
- **`/resume`** — Manually trigger `context-hydrator` (normally automatic).
- **`/parallel`** — Spins up a git worktree + new Claude session for parallel work.

### Hooks (`.claude/settings.json`)
- **`SessionStart`** → auto-invokes `context-hydrator`
- **`PostToolUse` on Edit|Write** → `scripts/lint-check.sh` (fast fail on syntax errors)
- **`Stop`** → `scripts/session-retro.sh` (appends session summary to progress + queues lesson extraction)

---

## The learning loop (how repeated mistakes die)

```
┌──────────────────────────────────────────────────────────────┐
│  Session starts                                              │
│    └─ SessionStart hook → context-hydrator subagent          │
│         └─ Reads LESSONS.md, claude_progress.txt, git state  │
│         └─ Returns ~500-token brief to main session          │
│                                                              │
│  Claude works... makes a mistake... fixes it...              │
│                                                              │
│  Session ends                                                │
│    └─ Stop hook → session-retro.sh                           │
│         └─ Invokes lesson-extractor subagent                 │
│         └─ Appends new Mistake/Cause/Fix/Prevention to       │
│            LESSONS.md                                        │
│                                                              │
│  Next session starts with the new lesson already loaded.     │
└──────────────────────────────────────────────────────────────┘
```

---

## Parallel work (kills the conflict problem)

Instead of opening two Claude Code sessions in the same dir:

```bash
# Terminal 1 — main work
cd ~/projects/blondeshell && claude

# Terminal 2 — publer bug fix in parallel, zero conflicts
cd ~/projects/blondeshell && /parallel publer-fix
# The /parallel command creates ../blondeshell-publer-fix worktree
# and launches Claude in that directory on a publer-fix branch
```

Each session = own working tree + own branch. Merge via PR.

---

## Model routing (cuts latency + cost)

Default session: Sonnet (balanced).
- Use `/model opus` when you hit architecture/planning.
- Use `/model haiku` for lint fixes, small edits, grep.
- Subagents already routed: hydrator/extractor = Haiku, reviewer = Sonnet.

---

## Next upgrades (after this kit stabilizes)

1. Add a `test-runner` subagent once you have a real test suite
2. Add a `migration-writer` subagent for the Base44→Claude property mgmt pilot
3. Scope MCP servers per-project via `.mcp.json` (reduce startup bloat)
4. When `LESSONS.md` > 200 lines, split it into `LESSONS-<domain>.md` files
