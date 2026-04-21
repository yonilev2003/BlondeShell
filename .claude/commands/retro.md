---
description: Capture lessons from this session into LESSONS.md
---

# Retro

Invoke the `lesson-extractor` subagent now. It will scan this session's conversation, identify any Mistake/Cause/Fix/Prevention patterns, and append them to `./LESSONS.md`.

After the subagent completes, also update `./claude_progress.txt` with:
- Current session's goal
- What was completed
- The exact next action for the following session
- Any open questions

Report the count of lessons added and the updated progress entry.
