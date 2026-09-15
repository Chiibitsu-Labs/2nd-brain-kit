---
date: 2026-09-15
project: 2nd-brain-kit (PR #20, further Codex rounds)
source: claude-code
tags: [ai-improvement, mistake, decision]
---

## AI mistakes

- Round 2's fix for `PENDING_SKILL_UPDATE.md` made the "recreated every sync" behavior
  honest for the case a reviewer actually described (an owner deliberately declining the
  update). It didn't occur to me to check whether the same root cause — comparing local
  directly against upstream, when local is expected to diverge from upstream forever once
  customized — also broke the opposite case: an owner who *takes* the update by merging it
  in by hand. It does, identically, since a hand-merge is never byte-identical to raw
  upstream either. A second Codex round caught it from that other direction. The lesson
  isn't "test more scenarios" in the abstract — it's that when a fix targets one reported
  symptom of a root cause, the same root cause's *other* consequences don't disappear just
  because nobody reported them yet, and are worth checking for directly rather than waiting
  for a second bug report to arrive.

## Decisions

- Had previously called a persisted decline-marker "a reasonable future enhancement,
  not built under review pressure" — a real, scoped design that solves the underlying
  problem rather than just documenting it honestly. Built it this round instead, once a
  second, independent finding hit the same root cause from the opposite direction. The
  threshold that changed my mind: one finding on a root cause can plausibly be addressed by
  being honest about the limitation; two independent findings on the same root cause from
  different angles means the limitation itself is the actual bug, and documenting it a
  second time would just be describing the same defect more carefully instead of fixing it.
