---
description: Structure a non-trivial task using Goal → Plan → Execution → Result before touching files
argument-hint: [short description of the task]
---

# Planning Mode

Task: $ARGUMENTS

Before writing any code or calling any write tool, produce this structure. Do not skip sections.

## 1. Goal
State the objective in one sentence. What does "done" look like?

## 2. Plan
Numbered steps. Each step must be:
- Small enough to verify independently
- Ordered by dependency
- Explicit about which files/systems are touched

Flag any step that is:
- Risky (destructive, hard to reverse)
- Parallelizable (can be dispatched to a subagent)
- Blocked on information you don't have

## 3. Tradeoffs
Call out at least one tradeoff (speed vs reliability, scope vs time, etc.).

## 4. Check LESSONS.md
Grep `./LESSONS.md` for tags relevant to this task. Summarize any entries that apply. If none, say so.

## 5. Confirmation
Stop. Wait for the user to approve, amend, or reject the plan before executing.

After approval, work through the plan step-by-step, reporting completion of each step. At the end, produce a "Result" section summarizing what changed and what should be logged to LESSONS.md (if anything).
