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
  chose to run the gate. The rule in doc 04 — every PR, however small the
  diff — is meant literally, and convenience is not a reason to make an
  exception to it.

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
- Merge order was driven deliberately: the PR carrying the CI workflow
  merged first, then the follow-up branch was updated to `main` so the
  gates applied to it. Before that update the follow-up ran only the
  mirror job; after it, all three checks ran and passed. A sibling
  branched before the CI lands is not covered by CI, and nothing warns
  about it — the checks list just looks short.
