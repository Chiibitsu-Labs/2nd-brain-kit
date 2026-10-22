---
date: 2026-09-15
project: 2nd-brain-kit (PR #20, further ChatGPT rounds)
source: claude-code
tags: [ai-improvement, mistake]
---

## AI mistakes

- Fixed a reviewer-found false positive in the connector orphan-reconciliation
  check (any file in `ai-improvements/*.md` with no matching index line —
  including `README.md`, and the deliberately-unindexed duplicate+pending
  note — would get misfiled as a lesson) by broadening the match test to
  "the note's `[[slug]]` appears anywhere in the index." That covered both
  known cases. It did not occur to me to check the same predicate for the
  opposite failure until the next review round caught it: "appears anywhere"
  is symmetrically too broad, since an ordinary index summary cross-referencing
  another note for unrelated context now also satisfies it — so a genuinely
  orphaned note (its index write actually failed) sitting behind such a
  mention would never be caught by the check that exists specifically to
  catch it. Fixed by requiring an exact literal marker (`consolidates
  [[slug]]`) instead of any occurrence. The lesson: narrowing or broadening a
  detection predicate under review pressure needs to be checked against what
  it might now let through, not just confirmed against the one complaint that
  prompted the change — the same discipline as checking a bug fix for its
  mirror image, applied to a match rule instead of a code path.
