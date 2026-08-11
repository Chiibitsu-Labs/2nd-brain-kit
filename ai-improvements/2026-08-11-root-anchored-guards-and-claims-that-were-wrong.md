---
date: 2026-08-11
project: 2nd-brain-kit (OAuth token typing review, origin vault inventory)
source: claude-code
tags: [ai-improvement, mistake, decision]
---

## AI mistakes

- The origin vault was inventoried from a single non-recursive listing of
  its root, and the absence of `vault-mcp/` there was reported as "the
  connector code is not in this repo". It is at
  `02_builds/tools/vault-mcp`, beside four other builds. The listing tool
  says non-recursive in its own description; the conclusion drawn from it
  was about the whole repository. The wrong finding had already been sent
  to another session as the basis for a plan, and the owner corrected it.

  Two of the other conclusions in that inventory rested on the same
  reading and happened to survive it, which is the part worth noticing:
  the ones that held did so by luck of layout, not because the method was
  sound.

- Two defects were found by review on this session's own pull request,
  and both were in claims the pull request made about itself rather than
  in a line of code. The migration guidance said an upgraded vault could
  wait out the 30-day access-token lifetime and then enable the strict
  setting for free; client registrations last a year and are checked
  first, so a client holding a legacy one is refused at the start of the
  reconnect that would have replaced it. Separately, "`typ` and `exp` are
  written after the caller's spread, so a caller can never mislabel a
  token" was false: an own enumerable `toJSON` copied by that spread is
  invoked by `JSON.stringify` in place of serializing the object, so the
  assignments never reach what gets signed.

  Neither was live — every caller in the tree passes an object literal,
  and no upgraded vault had the setting on. Both were written in the
  confident register used for things that had been checked, and neither
  had been. The code was tested; the sentences about the code were not.

## Decisions

- Review offered a way to make the strict setting cost nothing on
  upgraded vaults: exempt client registrations from it. It was declined.
  The exemption is safe on today's payloads for exactly one reason — a
  legacy access token carries no `redirect_uris`, so it fails the field
  check anyway — and that is the "safe because the shapes happen not to
  collide" property this change existed to stop depending on. It would
  also have left a mode named strict that was not.
- The strict setting ships off by default and the documentation now says
  what turning it on costs an upgraded vault, rather than describing a
  wait that makes it free. The reasoning recorded alongside it is that
  leaving it off is a sound end state and not a deferred risk: refusing a
  *mismatched* kind is unconditional either way, so the setting's only
  effect is refusing tokens that declare no kind at all, all of which the
  same server issued before the upgrade.
- The `toJSON` fix was mutation-checked before being committed, and the
  assertions were split so that two of the four read the decoded payload
  directly rather than going through the verifier — otherwise all four
  would have been killed by a mutation to the kind check instead of the
  one they exist to catch.

## Other

- The write guard's protected prefixes are matched from the start of the
  path, so they describe a vault whose connector sits at the root. A
  vault that keeps it in a subfolder — the origin vault keeps it under
  `02_builds/tools/` — has its own server code outside every mandatory
  prefix, and a write there is the redeploy-as-arbitrary-code case the
  prefix list exists to prevent. The root-file set is root-only for the
  same reason.

  The template sync has the matching assumption: it force-syncs the
  literal path `vault-mcp`, so in such a vault it would create an
  unused copy at the root while the running connector went on never
  being updated — a failure that looks like success. Both assumptions
  were invisible while every vault examined had been created from the
  deploy button, which puts the connector at the root.
