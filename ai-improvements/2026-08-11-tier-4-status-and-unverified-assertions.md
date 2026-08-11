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
  tree, and no Tier 4 pass — a security review of the app as a whole —
  is recorded anywhere. Route-level coverage is not the same gap, and
  reading only `product/audits/` understated it: the committed audit pack
  covers the MCP transport route plus one incidental finding against the
  OAuth token route, but commit messages on `main` are equally durable
  record, and `52a782b` documents seven review rounds and two clean
  passes over the `authorize` route's passphrase boundary. What is left
  without recorded coverage is `register` and the two well-known
  endpoints. Whether a restore has been performed by hand, or alerting
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
- The status of two `claude/*` branches was reported to the owner three
  times and revised twice, and the version that survived is the first
  one. Called open work on `git branch -r --no-merged`; corrected to
  "stale" from a grep suggested by a branch name; corrected again to
  "one carries 21 unmerged lines" after comparing file contents at the
  two tips; corrected a third time by review, back to stale. Settled by
  evidence rather than by another comparison:
  - `claude/throttle-passphrase-attempts` (`343799f`) — main commit
    `52a782b` changes `oauth/authorize/route.ts` by 84 lines and its
    message records "Seven review rounds, two independent clean passes
    on 343799f."
  - `claude/surface-auth-failures` (`0216d70`) — main commit `12c222c`
    (PR #3) records "passes on 0216d70."

  Both were squash-merged, so neither tip is an ancestor of `main` and
  `--no-merged` lists them, though their content landed. The 21 lines
  that read as unmerged work are the opposite: all 21 appear in the
  pre-hardening file at `12c222c`, so they are old lines the later
  security work replaced and the branch simply predates.

  Comparing tips showed the files differ. It could not show which side
  was ahead, and "differs" was read as "the branch has something extra"
  when the branch was behind. `git diff A...B` is
  `git diff $(git merge-base A B) B` — changes on B since the merge base,
  never changes made only on A — so the 531 and 336 line counts are each
  branch's own work since branching, including work whose content reached
  `main` by another route. The question the commit messages answered, and
  the diffs could not, was whether that content had already landed.
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
