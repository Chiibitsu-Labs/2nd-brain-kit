---
date: 2026-08-10
project: 2nd-brain-kit (PR #5 gate close, PR #6 OAuth follow-up)
source: claude-code
tags: [ai-improvement, mistake, preference, friction, decision]
---

## Preferences

- The owner ruled that improve notes are this vault's session record, so
  doc 04's HANDOFF exemption applies to them and a clean review pass
  survives a note commit landing after it. Doc 04 writes that exemption
  for an `ops/tasks.md` path this vault does not have, which is why the
  question arose at all. Recorded because a later session reading only
  the protocol document would count two passes as one.

## AI mistakes

- A verification table in a PR description said a case ended in
  "400-eventually" when the run it summarized showed the 200 parsing
  path. The observed line and the written line disagreed, in the one part
  of the description whose entire value is that it reports exactly what
  happened. Corrected within the same turn, but the table had already
  been published. Transcribing results is not a place to paraphrase.
- The PR #5 description was written early and left alone across 34
  commits, so by the time it was marked ready it described a note glob
  that had been superseded twice and a test count that had grown from 16
  to 28. Nothing flagged it — a stale description is invisible to CI and
  to reviewers who were not there for the middle of the branch.

## Workflow friction

- The first PR that adds CI creates a gap for every sibling branched from
  `main` before it: PR #6 ran only the mirror job, because `ci.yml` still
  lives in the unmerged PR #5. Nothing warns about this; the checks list
  simply looks short. It resolves by merge order — the CI PR first, then
  update the others.

## Decisions

- The deferred OAuth fix went into a separate PR off `main` rather than
  onto the security branch. The reason was not the review-gate cost,
  which is only a couple of cycles: PR #5's audit pack records its
  audited diff as frozen at a specific commit with the gate closed, and
  adding unaudited code after the fact would make that record false. A
  cosmetic status-code fix is not worth falsifying an audit trail.
- The fix was verified by first running the *unfixed* code against the
  same inputs and watching three of them throw. This is the same session's
  earlier lesson applied deliberately rather than remembered afterwards:
  a check never seen to fail is not evidence that anything is fixed.
- One case was deliberately left unfixed and named in the PR rather than
  quietly tightened: a nested object still stringifies to
  `[object Object]` and is rejected by the grant checks rather than by
  the parser. Refusing it means requiring string values, which would also
  refuse the numeric-value case that works today. Stating the trade was
  judged better than making it silently.
- Investigating the reported one-line defect surfaced two more in the
  same block — an array body throwing, and a JSON string body being
  re-parsed as a query, which meant the declared content type was not
  actually enforced. The report named one symptom; reading the
  surrounding lines for the same class of fault found the rest.
