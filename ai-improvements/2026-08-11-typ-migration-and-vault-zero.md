---
date: 2026-08-11
project: 2nd-brain-kit (OAuth token typing, client update path, origin vault)
source: claude-code
tags: [ai-improvement, mistake, decision, friction]
---

## AI mistakes

- The `typ` claim was recommended to the owner as costing almost
  nothing, on the stated grounds that no third party was connected yet
  and the only exposure was the owner's own session. Three client vaults
  were live at the time. Shipped as first described — requiring the
  claim outright — it would have disconnected all three at whatever
  moment their template sync merged, with no warning and no obvious
  cause from their side. The same wrong premise had already been written
  into a merged note, which recorded the deferral as an owner-only
  concern.

  The error was reasoning about the deployment picture from the
  repository, which shows the kit and not who is running it. The owner
  supplied the count in passing while asking a different question.

## Decisions

- `typ` shipped non-breaking rather than as the clean version. The claim
  is stamped on all three kinds and a mismatch is refused
  unconditionally, but a token carrying no claim at all is still
  accepted unless `OAUTH_REQUIRE_TYP` is set. A fresh deployment sets it
  at once and pays nothing; an existing one sets it after the 30-day
  access-token lifetime has turned over, at which point the leniency is
  no longer doing anything. The alternative considered was a hard
  cutover plus a note telling clients to reconnect, rejected because a
  connector that stops working is indistinguishable from a broken vault
  to the person holding it.
- The separation `typ` enforces was already holding before this change,
  by accident rather than by design: each verifier happened to require a
  field the other kinds do not carry. That was stated plainly in the
  pull request rather than described as closing a live hole, because the
  reason to make the change is that the property lived in four call
  sites instead of in the token format.
- Behavioural tests for the token layer were added and wired into CI
  rather than run once locally. The connector's only checks were a
  typecheck and an audit, and neither can distinguish a code from an
  access token — the types are identical. The tests were mutation-
  checked before being committed: deleting the kind check fails 8 of
  the 17, which is the step an earlier session in this vault skipped and
  then cited a test that could not fail as evidence three times.

## Other

- The origin vault turned out to be the least protected of the six, not
  the most. Read through its own connector it has no `.github/` at all —
  no backup snapshots, no mirror, no template sync, no CI — so it has no
  restore points and no path for kit fixes to reach it. Its connector
  code is not in the repo either, so installing template sync would
  still not update the running connector. Its improve skill predates the
  security-rules split. It also carries more agent-instruction surface
  than a plain notes vault. The hardening work had been reasoned about
  as flowing outward to clients, and the vault it started from was never
  checked.

## Workflow friction

- The origin vault could not be attached to this session: adding a
  repository from a different owner than the ones already present is
  refused. Work on it has to happen from a session that already holds
  it, or from a new session started against it. Reading it through its
  MCP connector was enough to inventory what was missing but not to
  propose a change to it.
