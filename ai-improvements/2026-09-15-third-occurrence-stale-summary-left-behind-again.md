---
date: 2026-09-15
project: 2nd-brain-kit (PR #20 review round 3)
source: claude-code
tags: [ai-improvement, mistake]
---

## AI mistakes

Third occurrence of the same lesson as
[[2026-09-15-cross-vendor-audit-caught-two-of-my-own-claims]] and
[[2026-09-15-same-pattern-again-missed-cross-reference-and-a-second-false-claim]] — recorded
here, consolidated onto that same index line rather than as a fourth Open entry.

- `SKILL.md` §0's "short version" summary — the very first thing a session reads — still
  said "write only to `ai-improvements/` and `00_moc/`; commit only those exact paths,"
  unqualified, through the entire PR: the original port (round 0), round 1's write-scope
  widening, and round 2's connector-path rewrite all changed the *substance* of what the
  skill may write, and none of them checked whether this three-line summary near the top
  of the file still matched it. A cross-vendor reviewer caught it on the third review pass,
  not any self-check across three separate rounds of editing the surrounding file.

This is no longer a one-off — it's a specific, identifiable blind spot: **when a change
touches a rule's substance, the habit that's missing is checking every summary,
cross-reference, or "short version" of that rule elsewhere in the same file (or a file
that points at it), not just the section being edited.** Worth treating as a checklist
item on any future documentation-shaped change in this vault, not just something to
notice after the fact each time.
