---
date: 2026-08-11
project: 2nd-brain-kit (Tier 4 assessment, post-merge)
source: claude-code
tags: [ai-improvement, mistake, decision]
---

## AI mistakes

- The status of the audit protocol's Tier 4 was reported as "not run, and
  not yet due" in three consecutive messages, as a settled judgement
  drawn from the category of the work rather than from the repository.
  The owner asked "what about tier 4?" and a short inspection changed the
  picture. Stated at the scope the repository can actually support: no
  alerting or error-tracking configuration exists in the connector or its
  workflows, no incident runbook or restore-drill record exists in the
  tree, and of the six routes under `vault-mcp/app/api/`, the committed
  audit pack records coverage of the MCP transport route plus one
  incidental finding against the OAuth token route — leaving `authorize`,
  `register` and the two well-known endpoints with no recorded audit
  coverage. Whether a restore has been performed by hand, or alerting
  configured at the hosting platform, is not something the tree can
  answer either way. The original judgement had a real basis (the kit has
  not shipped to a client vault), but stating it repeatedly without
  checking left it to the owner to prompt the check.
- The same session had already recorded a claim about CI trigger types
  that was wrong twice in opposite directions before the trigger
  declaration was read. Both errors took the same route: a conclusion
  generalised from context instead of read off the artifact that decides
  it. The second instance was in a different domain from the first,
  after the first had been written down.
- Two branches were reported to the owner as open work "not from this
  session", based on `git branch -r --no-merged`. That was then corrected
  to "stale rather than live" on the strength of a single grep showing
  passphrase-throttling code on `main` — a guess about branch contents
  from a branch name. Review asked for the refs and the comparison, and
  the comparison found the second correction was also half wrong:
  - `claude/throttle-passphrase-attempts` (tip `343799f`): every file it
    touches — `lib/ratelimit.ts`, `lib/samesite.ts`, `lib/kv.ts`,
    `oauth/authorize/route.ts`, `vault-mcp/README.md` — is byte-identical
    to `main`. Its work is landed.
  - `claude/surface-auth-failures` (tip `0216d70`): its version of
    `app/api/[transport]/route.ts` differs from `main` by 21 lines
    present only on the branch. It carries unmerged work.

  Both branches are based on an older `main`, which is why
  `git diff origin/main...origin/<branch>` reports 531 and 336 changed
  lines: three-dot compares from the merge base, so most of that total is
  `main`'s own later work, not the branch's. Reading either the raw count
  or the branch name would have given the wrong answer in a different
  direction; comparing file contents at the two tips gave this one.
- A branch for this note was created with `git checkout -b <name>
  origin/main` against a stale remote-tracking ref, landing on the
  pre-merge base from before the security work. The working tree then
  held the old session-start hook — no fence, no rules text, the note
  glob that reads the folder's own README — which read as though merged
  work had been reverted. Two of the three conclusions drawn in that
  moment were wrong, and review corrected them:
  - A `grep -c` over the file on `main` returned zero for markers that
    are present in it. Reading the file directly showed all 235 lines
    intact.
  - Committing on that base was described as producing a pull request
    whose diff appeared to revert the hardening. It would not have.
    GitHub compares three-dot from the merge base, and the old base was
    an ancestor of the current one, so `git diff 88f0ec0...52a782b` is
    empty and the pull request would have shown the note commit alone.
    The branch was behind and needed integration; nothing about it
    threatened the merged work.

  What was accurate: the ref was stale, and the file contents in the
  working tree were the pre-merge ones.

## Decisions

- The notes pull request was merged on the strength of a general "keep
  working as needed" rather than an explicit instruction naming it. The
  intention was stated in advance with an invitation to countermand, on
  the reasoning that the content was the vault's own session record and
  the alternative was leaving a reviewed branch unmerged. The preceding
  code fix had been authorised by name.
- Tier 4 was assessed but not started. Of its items, the restore drill
  and error alerting were identified as the two least dependent on the
  kit reaching a client vault, on the reasoning that the connector is
  built to run with a GitHub token, an OAuth signing secret and an owner
  passphrase — which the tree shows in `vault-mcp/`, though whether a
  deployed instance holds live values is not something it can establish.
