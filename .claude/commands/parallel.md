---
description: Create a git worktree and launch a parallel Claude Code session on a new branch. Use instead of opening two sessions in the same directory.
argument-hint: [branch-name]
---

# Parallel Session Setup

Branch name: $ARGUMENTS

Execute these steps. Do not deviate.

## 1. Validate
- Confirm we're in a git repo (`git rev-parse --show-toplevel`)
- Confirm the branch name is provided and is a valid git ref name
- Confirm the branch doesn't already exist as a worktree (`git worktree list`)

## 2. Determine paths
- Repo root: output of `git rev-parse --show-toplevel`
- Repo name: basename of repo root
- Worktree path: `<repo-root-parent>/<repo-name>-<branch-name>`

## 3. Create worktree
```bash
git worktree add <worktree-path> -b <branch-name>
```

## 4. Copy environment
- Copy `.env` (if it exists) to the new worktree
- Copy any other gitignored config files the project needs (check with the user if unsure)
- Node/Python: install deps in the worktree (`npm install` / `pip install -r requirements.txt` / `uv sync`)

## 5. Seed progress file in worktree
Create a `claude_progress.txt` in the worktree with:
```
## [YYYY-MM-DD HH:MM] Parallel session spawned from <source-branch>
**Goal:** <ask the user what this parallel session is for>
**Status:** starting
**Parent branch:** <source-branch>
**Worktree path:** <worktree-path>
```

## 6. Report back
Tell the user:
- The exact path to the new worktree
- The command to launch Claude there: `cd <worktree-path> && claude`
- A reminder: merge via PR, do NOT cherry-pick or rebase across worktrees blindly

Do NOT attempt to launch the new Claude session yourself — the user opens it in a separate terminal.
