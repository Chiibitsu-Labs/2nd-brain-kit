---
date: 2026-08-10
project: 2nd-brain-kit (PR #5 merge, PR #6 review gate)
source: claude-code
tags: [ai-improvement, mistake, preference, decision]
---

## AI mistakes

- A message ended with a paragraph about whether to write a
  "`product/audits/` pack" for a follow-up PR, using doc 04's tiers and
  triggers as though they were shared vocabulary. The owner replied "not
  sure what you mean." The document had been handed over hours earlier,
  and the paragraph was optional context appended to an otherwise plain
  status report. The restatement that landed was two sentences with no
  protocol terms in them.
- Three rounds of review on this very note each found the same defect:
  text that told a future session what to do rather than recording what
  happened. Round one flagged "convenience is not a reason to make an
  exception"; the rewrite added "a short checks list is worth looking
  at"; each fix introduced a fresh instance of what it was fixing. The
  note was then rewritten to drop advisory phrasing as a class rather
  than patch it line by line.

## Preferences

- Offered the choice between merging a 32-line status-code fix
  immediately and running the two-pass review gate on it first, the owner
  chose the gate, confirming that doc 04's "every PR, however small the
  diff" was meant to cover changes that small. The gate then found a
  defect that the fix itself had introduced.

## Decisions

- An explicit "go merge" was not acted on immediately, because the PR had
  green CI but zero review passes, and merging would have been the first
  exception to a gate built earlier the same day. The facts were stated
  once and the choice handed back. The owner chose the gate, and it found
  a real defect on that PR.
- The session note for this work was committed on its own branch off
  `main` rather than onto an open PR's branch, because a note commit
  there would have reset the review count for a pass already in flight.
- A follow-up PR opened while the CI workflow was still unmerged ran only
  the mirror job. After the CI PR merged and the follow-up branch was
  updated to `main`, all three checks ran and passed. Review corrected
  the conclusion drawn from that sequence twice. What the evidence
  supports: the second push produced a `synchronize` event at a moment
  when `main` carried the workflow. What it does not support: that
  updating the branch was required — `.github/workflows/ci.yml` declares
  a bare `pull_request:` trigger, whose default activity types are
  `opened`, `synchronize` and `reopened`, and those are evaluated against
  the base, so one of those three events would have run the checks
  without the branch carrying the workflow file. Comments, labels and
  reviews are not among them. During the window before any such event,
  the only visible sign was that the checks list was short; nothing
  announced that a workflow had not run.
