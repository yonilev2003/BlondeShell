#!/usr/bin/env bash
# SessionStart hook: prompts Claude to hydrate context from the hydrator subagent.
# Uses hookSpecificOutput to inject an instruction into the session.

set -euo pipefail

# Build a minimal context string — git state + reminder to invoke hydrator
BRANCH=$(git -C "$CLAUDE_PROJECT_DIR" branch --show-current 2>/dev/null || echo "not-a-repo")
STATUS=$(git -C "$CLAUDE_PROJECT_DIR" status --short 2>/dev/null | head -20 || echo "")
STATUS_LINE=$(echo "$STATUS" | wc -l | tr -d ' ')

# Emit JSON that becomes additional system context
# Reference: https://docs.claude.com/en/docs/claude-code/hooks
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Session started on branch: ${BRANCH}. Working tree: ${STATUS_LINE} changed files. Before taking on any task, invoke the context-hydrator subagent to load LESSONS.md and claude_progress.txt."
  }
}
EOF

exit 0
