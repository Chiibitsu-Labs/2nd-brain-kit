---
date: 2026-08-11
project: 2nd-brain-kit (review gate under an unavailable reviewer)
source: claude-code
tags: [ai-improvement, decision, friction]
---

## Decisions

- With the external reviewer out of quota and two client deployments due,
  the owner asked whether to merge now and review later. Three of the four
  open changes were merged unreviewed and the fourth held.

  The line drawn was not by size or by subject but by whether the change
  is inert until switched on. Two of the three do nothing at all until a
  new setting is given a value: with `VAULT_CONNECTOR_PATH` unset the sync
  destination resolves to the same literal path as before and the guard's
  prefix list is unchanged, and with no `.claude/improve.paths` the note
  loader reads the two paths it always read. All the new behaviour sits
  behind a value nobody has set yet, which means merging it changes
  nothing for anyone today and leaves the review to happen against real
  use. The third was a note.

- The one held back was the OAuth token-kind change, and the reason was
  the shape of the trade rather than the risk. Merging it buys two new
  vaults a better token format; if it is wrong, the failure is a connector
  that will not authorise, during a live onboarding session, on the day
  those sessions happen. The same benefit is available a few days later
  for one reconnect per vault. It is also the change outside review had
  already found two real defects in, so it is where a scarce reviewer is
  worth spending.

- Stated plainly to the owner that "review later" usually means never, so
  the real question was whether to merge unreviewed. Naming that was what
  made the per-change split worth doing instead of treating all four the
  same.

## Workflow friction

- The rollback story turned out to be the thing that made this decision
  easy, and it was never written down anywhere: the deployment platform
  keeps previous builds, so recovering a broken connector is promoting the
  last good one rather than reverting and waiting for a rebuild. The gate
  had been reasoned about as though a merge were irreversible.
