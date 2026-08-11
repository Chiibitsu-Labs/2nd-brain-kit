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
  picture: no error tracking or alerting exists anywhere in the connector
  or its workflows, the backup restore has never been drilled, there is
  no incident runbook, and the four OAuth routes — where authentication
  actually happens — have never been covered by any audit pass, with a
  token-design deferral from the first audit round still open. The
  original judgement had a real basis (the kit has not shipped to a
  client vault), but stating it repeatedly without checking left it to
  the owner to prompt the check.
- The same session had already recorded a claim about CI trigger types
  that was wrong twice in opposite directions before the trigger
  declaration was read. Both errors took the same route: a conclusion
  generalised from context instead of read off the artifact that decides
  it. The second instance was in a different domain from the first,
  after the first had been written down.
- Two branches were reported to the owner as open work "not from this
  session", based on the output of `git branch -r --no-merged`. The
  passphrase-throttling code those branch names describe was already on
  `main`, so the branches were stale rather than live, and the report was
  corrected in the following message.
- A branch for this note was created with `git checkout -b <name>
  origin/main` against a stale remote-tracking ref, landing on the
  pre-merge base from before the security work. The working tree then
  held the old session-start hook — no fence, no rules text, the note
  glob that reads the folder's own README — and a commit there would have
  produced a pull request whose diff appeared to revert the entire
  hardening change. It surfaced because a harness message about the file
  having changed prompted a check of `git status` and the merge
  ancestry; the branch was recreated from a freshly fetched `origin/main`.
- While investigating that, a `grep -c` over the file on `main` returned
  zero for markers that are present in it, which briefly read as evidence
  that merged work had been reverted. The count was wrong, and reading
  the file directly showed all 235 lines intact.

## Decisions

- The notes pull request was merged on the strength of a general "keep
  working as needed" rather than an explicit instruction naming it. The
  intention was stated in advance with an invitation to countermand, on
  the reasoning that the content was the vault's own session record and
  the alternative was leaving a reviewed branch unmerged. The preceding
  code fix had been authorised by name.
- Tier 4 was assessed but not started. Of its items, the restore drill
  and error alerting were identified as the two that do not depend on the
  kit reaching a client vault, since the connector is already deployed
  and holds live credentials.
