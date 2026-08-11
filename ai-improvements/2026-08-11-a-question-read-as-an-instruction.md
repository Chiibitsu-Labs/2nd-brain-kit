---
date: 2026-08-11
project: 2nd-brain-kit (OAuth token typing, merge timing)
source: claude-code
tags: [ai-improvement, mistake, decision]
---

## AI mistakes

- The owner wrote "#12 why after? I want them to get the best version
  now". That is a question followed by a statement of preference. The
  second half was acted on — resolve the conflict, verify, merge — and
  the first half was never answered. The owner then asked why the merge
  had happened.

  The reasoning for waiting had been given in an earlier message, so
  "why after?" was most likely a request to hear it again or to have it
  defended, not an instruction to proceed. Acting satisfied the half of
  the message that authorised action and skipped the half that asked for
  an explanation, which is the wrong half to drop when both are present:
  an unanswered question can be answered later, but a merge that should
  not have happened yet has already happened.

  Worth separating from a plain misread. The action taken was one the
  owner did want; the failure was ordering, doing it before answering
  rather than after. A message containing both a question and an
  approval is not the same as an approval.

## Decisions

- The merge stood, on the owner's reasoning rather than the reasoning
  that had been offered against it. The argument for waiting was that a
  connector which fails to authorise would fail during a live onboarding
  session, and that the same benefit was available days later for one
  reconnect per vault. The owner's argument is stronger: a vault deployed
  fresh has no legacy tokens at all, so it can be given the strict
  setting on day one and keep it, where a vault deployed without the
  change needs a second pass later to turn it on. Deploying something
  correctly costs less than retrofitting it.
- The conflict between the two open changes was resolved by keeping
  both settings and grouping them by subject rather than by which
  branch they arrived on — the connector-path setting beside the other
  path settings, the token setting after them. Both had been inserted at
  the same anchor in the same list, which is why they collided at all.
