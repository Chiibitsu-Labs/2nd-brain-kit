---
date: 2026-08-11
project: 2nd-brain-kit (origin vault exposure, connector path configuration)
source: claude-code
tags: [ai-improvement, mistake, decision, friction]
---

## AI mistakes

- A stopgap was recommended to the owner for their operational vault —
  set `VAULT_PROTECTED_PREFIXES` to cover the directory holding the
  connector — that would have reduced its security rather than improved
  it. The deployed connector there is an early version in which that
  variable *replaces* the default protections instead of adding to them,
  so following the advice would have unprotected the hook scripts that
  run at session start and the plugin code that runs when the vault is
  opened.

  The uncertainty was stated in the same message — that an early version
  behaved that way and the deployed version was unknown — and the advice
  was given anyway, labelled a two-minute fix. Flagging a doubt is not
  the same as resolving one, and an action framed as quick and safe is
  read as a recommendation regardless of the caveat attached to it.

  The deployed source was readable the whole time, through the same
  connector already being used to list that vault's directories. The
  check was available, took one call, and was left to someone else. This
  is the second time in one session that a conclusion was drawn from the
  part of a system already in view while the means to see the rest sat
  unused — the first was inventorying a repository from a single
  non-recursive listing of its root.

- The outside session confirmed the root-anchoring gap by extracting the
  deployed guard into a harness and running paths through it, producing a
  verdict per path. The version of that finding produced here came from
  reading the prefix list and reasoning about what it would match. Both
  reached the same conclusion; only one of them would have caught the
  case where the reasoning was wrong.

## Decisions

- The fix names the connector's location once, in `VAULT_CONNECTOR_PATH`,
  and uses that single value for two things: the write guard's protected
  prefix, and the template sync's destination for the connector. They had
  been separate symptoms — server code writable, and a sync that would
  update a copy nobody runs — with one missing value behind both.
- That variable adds a prefix rather than replacing the mandatory list,
  deliberately mirroring what went wrong above: a wrong value costs
  coverage of a path that was never protected, instead of removing
  protection from paths that were.
- The origin vault was left off the kit's critical path for now, on the
  outside session's argument that moving its connector to the repo root
  would fight the vault's organization and require changing the one
  deploy setting whose misconfiguration has silently broken deploys
  before — with two client deployments the same week.

## Workflow friction

- The review gate wants two consecutive clean passes from an outside
  reviewer, and the reviewer is a metered service. It reached its usage
  limit mid-gate, after finding two real defects and before the pass that
  would have come back clean. Two pull requests are now waiting on a
  reviewer that cannot run, with no second vendor configured and no
  written fallback for the case. The gate had been treated as a property
  of the process; it is a property of a quota.
