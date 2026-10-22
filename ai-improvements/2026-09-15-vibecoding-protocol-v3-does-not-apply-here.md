---
date: 2026-09-15
project: 2nd-brain-kit (PR status reporting)
source: claude-code
tags: [ai-improvement, decision]
---

## Decisions

- Asked to report PR status "following the new vibecoding protocol v3,"
  with no docs attached at first. Declined to guess at an unnamed
  protocol and said so plainly instead of inventing one or silently
  ignoring the instruction. When the user then attached the actual
  vibeOS protocol docs (docs 02, 04, 06), read them and checked them
  against this repo's actual state rather than assuming they applied:
  v3's tiers are bound to specific tooling (the `chiibitsu/gates`
  toolkit, a same-vendor draft-stage reviewer, a cross-vendor finisher
  bot, `REVIEW.md`, a two-flip cap) that `2nd-brain-kit` has none of —
  no `REVIEW.md`, no gates-toolkit caller, no bound reviewer bots. So
  reported plain CI/mergeable/review status instead of fabricating a
  "flip count" or "Tier 2 round" that never ran. The protocol's own
  language names this exact failure mode ("a claim in a note, not a
  fact anyone can check") — reporting fictitious gate state here would
  have been that failure, not an application of the protocol.
