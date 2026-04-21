---
description: Manually load project context (progress + lessons + git state). Normally automatic via SessionStart hook.
---

# Resume

Invoke the `context-hydrator` subagent to produce a session brief.

Use this when:
- The SessionStart hook didn't fire (plugin environments, CI, etc.)
- You want a fresh context pull mid-session after major changes
- You compacted the context and want to reload the essentials
