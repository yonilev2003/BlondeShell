---
description: Run the full ship sequence — review, lint, test, commit, push, open PR
argument-hint: [commit message]
---

# Ship Sequence

Commit message: $ARGUMENTS

Execute in order. Stop on first failure and report.

## 1. Pre-flight
- Run `git status` — confirm there are changes to ship
- Run `git diff --stat` — confirm scope matches intent

## 2. Review
- Invoke the `code-reviewer` subagent on the current diff
- If verdict is `BLOCK` or `REQUEST_CHANGES` — stop, report findings, do not proceed
- If verdict is `APPROVE` — continue

## 3. Quality gates
Detect the project type and run the appropriate commands:
- Node/TS: `npm run lint && npm run typecheck && npm test` (or pnpm/yarn equivalent)
- Python: `ruff check . && mypy . && pytest`
- Fall back to whatever scripts exist in `package.json` / `Makefile`

Stop on any non-zero exit.

## 4. Commit
- Stage relevant files (do NOT use `git add .` blindly — confirm the set)
- Commit with the provided message
- If no message provided, generate one following the project's convention (check recent `git log`)

## 5. Push & PR
- Push the branch
- If `gh` is available, open a PR with:
  - Title from commit message
  - Body containing: summary, test plan, any LESSONS.md entries created this session
- Otherwise print the compare URL

## 6. Post-ship
- Invoke the `lesson-extractor` subagent to capture any learnings from this shipping cycle
- Update `claude_progress.txt` with the PR link and next action
