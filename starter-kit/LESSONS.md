# LESSONS.md — Known Pitfalls & Learnings

<!--
  Format enforced by lesson-extractor subagent.
  Every entry: Mistake / Cause / Fix / Prevention.
  Newest at top. Dedupe on Mistake line.
  When this file exceeds ~200 lines, split by domain (LESSONS-api.md, LESSONS-ui.md, etc.)
-->

## How to read this file
Before starting any task, scan the **"Relevant to current task"** section by grepping for keywords in your task description. If you're editing the API layer, grep for `api|endpoint|fetch`. If you're touching auth, grep `auth|token|session`.

---

## Entries

<!-- Example entry — delete after first real lesson is added -->
### [EXAMPLE] Seedream direct generation loses character identity
- **Mistake:** Used `fal-ai/bytedance/seedream/v4.5` generation endpoint with LoRA reference
- **Cause:** Direct generation endpoint silently drops identity lock; no error returned
- **Fix:** Switched to `fal-ai/bytedance/seedream/v4.5/edit` with up to 4 reference images
- **Prevention:** For any character-consistent generation, always use `/edit` endpoint, never `/generate`. Logged in `src/image-gen/README.md` as hard rule.
- **Date:** 2026-03-15
- **Tags:** `fal.ai`, `seedream`, `character-consistency`

---

<!-- New entries go above this line -->
