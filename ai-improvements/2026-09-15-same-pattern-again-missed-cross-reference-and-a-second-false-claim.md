---
date: 2026-09-15
project: 2nd-brain-kit (PR #20 review round 2)
source: claude-code
tags: [ai-improvement, mistake, decision]
---

## AI mistakes

Second occurrence of the same lesson as
[[2026-09-15-cross-vendor-audit-caught-two-of-my-own-claims]] — recorded here rather than
as a fresh topic, since the index rule I wrote earlier today says not to.

- Fixed `SECURITY.md` §5's atomicity claim last round but never went back to check §4,
  which cross-referenced §5 and made an unqualified version of the same claim §5 no longer
  supported. Editing the section a claim's *source* lives in without checking every place
  that claim is *repeated or pointed at* is exactly how a document ends up contradicting
  itself — caught by cross-vendor review reading the live PR head, not by me re-reading my
  own diff before pushing it.
- Wrote `PENDING_SKILL_UPDATE.md`'s generated text as "delete this file to decline the
  update" without tracing whether the workflow logic actually honors that — it doesn't;
  nothing keys off deletion, only a content comparison, so the claim was false the moment
  it was written. Same root pattern as the §4/§5 miss: describing intended behavior in
  prose without checking it against the actual mechanism that would need to produce it.

## Decisions

- Round 2 of the same PR's cross-vendor review re-raised round 1's disputed finding
  (GitHub Issues as a pending-item default) with a second independent reading of the task
  text landing the same way. Decided to stop re-arguing the dispute and just take the
  conservative fix (drop the invented default) — the fix cost nothing and satisfied both
  readings, so continuing to defend a text-interpretation position past a second
  independent disagreement wasn't worth the round it would have cost.
- **Noted, not acted on**: writing this note surfaced a real gap in the Open/Archive
  triage rules from earlier today — they don't say what to do when a note is *both* a
  duplicate of an existing Open line *and* one that can't be promoted this session (no
  destination exists). Handled it here by consolidating to the original note's index line
  rather than adding a third, but that's a judgment call this session made, not a
  documented rule. Worth a future pass on `SKILL.md` if this combination keeps recurring.
