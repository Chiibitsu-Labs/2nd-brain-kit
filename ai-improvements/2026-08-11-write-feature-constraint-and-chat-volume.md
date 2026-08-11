---
date: 2026-08-11
project: 2nd-brain-kit (pre-handover hardening, product constraints)
source: claude-code
tags: [ai-improvement, preference, decision, mistake, friction]
---

## Preferences

- The owner asked for far less chat volume: mechanical progress kept out
  of chat, and messages limited to what is needed of them, what changed,
  or what is genuinely worth surfacing — "less tokens more work". They
  also asked that anything requiring their action carry an emoji they can
  spot while scanning, since they do read the whole thread but should not
  have to parse it to find their own to-do list. This is recorded here as
  a fact about what the owner said; a standing instruction of this kind
  belongs in `CLAUDE.md`, where it is visible and reviewable in a diff.
- The connector's write tool is the product, not a feature to be traded
  away for safety. The owner's framing: a client says "save that to my
  vault" in an ordinary chat and their single source of truth grows with
  them. Hardening proposals that narrow what can be written — the
  allowlist question left open by the earlier guard work — run against
  this. The owner asked instead whether writes could be protected by
  verifying identity more strongly, and set a second constraint on any
  such scheme: nothing they have to rotate.

## Decisions

- On hardening writes by identity: identity is already verified at two
  points — the owner passphrase at the OAuth authorize step, and the
  signed access token presented on every call. The exposure that the
  path guard work was actually addressing is different in kind: a
  legitimately connected assistant being steered by content it read.
  A passphrase, a PIN or a second factor cannot separate that from
  ordinary use, because the write arrives inside the owner's own
  authenticated session. So a passcode was judged to add friction
  without addressing the case that motivated the question, and the
  reply said so rather than building it.

  The rotation-free identity option that does hold up is a passkey at
  the authorize step in place of the passphrase: nothing memorized,
  nothing to rotate, phishing-resistant, one registered credential per
  vault, requiring the optional KV store. Not scheduled before the
  owner's customer session — it is a day of work and the kit is safe
  without it.
- The `typ` claim on OAuth tokens stayed deferred, now with the timing
  argument recorded rather than only the objection: it invalidates every
  token already issued, and at present no third party is connected, so
  the cost is one reconnect by the owner. Nothing about a vault's notes
  changes, and an already-deployed vault only sees the change if it
  redeploys. The owner was asked to say go.
- The throwaway Vercel deployment is to be deleted along with the
  GitHub token it was issued, and the pre-customer test is a fresh
  deploy from the button rather than an inspection of the existing one —
  a fresh deploy exercises the button, the current `main`, and the
  written setup steps end to end, which is what is actually being
  handed to a client.

## AI mistakes

- The restore drill recorded "both existing tags pointed at the same
  commit" as part of its finding, phrased as evidence that restore
  points were not accumulating. Checking the snapshot workflow and the
  commit dates afterwards showed the job was behaving correctly: it tags
  the branch head weekly and skips if the tag exists, and nothing had
  been pushed between the two runs, so two runs over a quiet fortnight
  legitimately produce one commit under two names. The observation was
  true and the implication was not — a scheduled job was described as
  falling behind without checking whether there had been anything for it
  to capture.

## Workflow friction

- The same four open decisions were restated in full at the close of
  several consecutive status messages, on the reasoning that the owner
  was away and each message should stand alone. Re-reading them, the
  repetition was most of the volume, and it is what prompted the request
  to cut chat down. A list of open questions that has not changed does
  not need restating in full each time it is still open.
