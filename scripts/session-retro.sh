#!/usr/bin/env bash
# Stop hook: at the end of every session, nudge Claude to capture lessons + update progress.
# Uses decision: "block" with a reason → forces Claude to do the retro before truly stopping.
#
# Loop protection: stop_hook_active is true if Stop already fired and Claude continued.
# If true, we exit 0 to allow the actual stop. This prevents infinite retro loops.

set -uo pipefail

INPUT=$(cat)
ALREADY_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')

# Second time around → let it stop
if [ "$ALREADY_ACTIVE" = "true" ]; then
  exit 0
fi

# Skip if no meaningful work happened (no modified files in tree)
CHANGES=$(git -C "$CLAUDE_PROJECT_DIR" status --short 2>/dev/null | wc -l | tr -d ' ')
RECENT_COMMITS=$(git -C "$CLAUDE_PROJECT_DIR" log --since="1 hour ago" --oneline 2>/dev/null | wc -l | tr -d ' ')

if [ "$CHANGES" = "0" ] && [ "$RECENT_COMMITS" = "0" ]; then
  exit 0
fi

# First time → ask Claude to do the retro before stopping
cat <<EOF
{
  "decision": "block",
  "reason": "Before ending the session: (1) invoke the lesson-extractor subagent to capture any new Mistake/Cause/Fix/Prevention learnings into LESSONS.md, and (2) update claude_progress.txt with the current goal, what was completed, the exact next action, and any open questions. Then you may stop."
}
EOF

exit 0
