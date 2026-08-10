---
date: 2026-08-10
project: 2nd-brain-kit (PR #5 merge, PR #6 review gate)
source: claude-code
tags: [ai-improvement, mistake, preference, decision]
---

## AI mistakes

- A message ended with a paragraph about whether to write a
  "`product/audits/` pack" for a follow-up PR, referring to doc 04's
  tiers and triggers as though they were shared vocabulary. The owner
  replied "not sure what you mean." The protocol document had been handed
  over hours earlier; reading it once does not make its shorthand fluent,
  and the paragraph was optional context tacked onto the end of an
  otherwise plain status report. Explaining a decision *not* to do
  something is exactly where jargon costs the most, because the reader
  has no artifact in front of them to infer the meaning from. The
  restatement that worked was two sentences with no protocol terms in
  them.

## Preferences

- Offered the choice between merging a 32-line status-code fix
  immediately and running the two-pass review gate on it first, the owner
  chose the gate, confirming that doc 04's "every PR, however small the
  diff" was meant to cover changes that small. The gate then found a
  defect that the fix itself had introduced.

## Decisions

- An explicit "go merge" was not acted on immediately, because the PR had
  green CI but zero review passes and merging would have been the first
  exception to a gate built earlier the same day. The facts were stated
  once and the choice handed back, rather than either merging silently or
  refusing. The owner chose the gate. Raising it cost one exchange; the
  alternative would have quietly undercut the rule while appearing to
  follow the owner's instruction.
- The session note for this work was committed on its own branch off
  `main` rather than onto the open PR's branch. A note commit there would
  have reset the review count for a pass already in flight — the
  session-record exemption covers the vault's own repo, but the cost here
  was a live review, not a rule.
- A follow-up PR opened while the CI workflow was still unmerged ran only
  the mirror job. After the CI PR merged and the follow-up branch was
  updated to `main`, all three checks ran and passed. What that sequence
  actually establishes is narrower than it first looked: the second push
  produced a new pull-request event at a moment when `main` carried the
  workflow. It does not establish that updating the branch was required —
  review pointed out that a `pull_request` workflow present on the base
  is evaluated for any subsequent event on the PR, so re-triggering would
  likely have sufficed. Recorded this way because the wider reading —
  "a branch created before CI landed is not covered by it" — would send a
  later session rewriting a reviewed branch when a new event was all that
  was missing. The observation that holds: a short checks list is worth
  looking at, since nothing announces that a workflow did not run.
