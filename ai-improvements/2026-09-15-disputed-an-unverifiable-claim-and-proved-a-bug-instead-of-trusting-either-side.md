---
date: 2026-09-15
project: 2nd-brain-kit (PR #20, independent-audit round)
source: claude-code
tags: [ai-improvement, decision]
---

## Decisions

- A review round cited "the authoritative source-vault contract" of a repo out of scope
  for this session (`chiibitsu/aikiri-garden`) to argue a design decision was wrong.
  Declined to accept the claim at face value, since I have no way to check what that repo
  currently says, and disputed instead by citing the exact language of the task brief I was
  actually given — which the finding's proposed fix would have directly contradicted ("don't
  leave two lines describing the same thing"). Treated an unverifiable citation as exactly
  that: unverifiable, not automatically authoritative, and not a reason to override
  instructions I can actually quote.
- The same round raised a second claim I *could* check — that the session-start hook and the
  index disagree on how to pick "most recent" notes. Didn't accept or dismiss it on the
  reviewer's word either: proved it against this branch's own commit history (8 same-day
  notes, hook's filename-sort picks the wrong 3 of them, checked against real timestamps)
  before agreeing it was real. Then, having confirmed it, checked whether it was actually in
  this PR's diff — it wasn't, the hook's note-selection logic is untouched here — and chose
  to name the bug honestly rather than rush a fix into an already-large PR touching a file
  with 42 existing behavioral tests. Three separate calls in one round (dispute, verify,
  scope), each made independently on its own evidence rather than defaulting to agreement or
  disagreement with the reviewer.
