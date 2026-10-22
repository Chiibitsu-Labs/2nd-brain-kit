---
date: 2026-09-15
project: 2nd-brain-kit (PR #20, further Codex round)
source: claude-code
tags: [ai-improvement, mistake]
---

## AI mistakes

- Second occurrence of the same lesson as
  [[2026-09-15-broadened-the-orphan-check-past-the-line-it-needed]]:
  introduced a new lifecycle state (a duplicate+pending note deliberately
  left off its own index line, represented only via a `consolidates
  [[slug]]` marker inside a sibling's line) without tracing it through
  every place in `SECURITY.md` that reasons about a note's index
  representation. The orphan-reconciliation check already needed two
  rounds of fixes for this new state (a false positive, then a false
  negative once the first fix over-corrected). A third place —
  reconciliation step 1's "stamped note whose index line is still under
  Open" test — carried the same unstated assumption that every stamped
  note owns an Open line, which the new state breaks by design: if the
  lineless note is the one stamped first in a multi-note promotion and
  its line-owning sibling's write then fails, the stamped note has no
  Open line to be found by, and the interrupted group goes unrepaired. A
  reviewer caught it, not a self-check run when the representation was
  first added. The pattern across both notes: adding a new
  representation to a system needs one deliberate pass over every
  consumer of that representation, not piecemeal fixes as each
  consumer's blind spot gets reported by a different review round.
