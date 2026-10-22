---
date: 2026-09-15
project: 2nd-brain-kit (improve-skill inbox/promotion port)
source: claude-code
tags: [ai-improvement, decision, friction]
---

## Decisions

- Split the ported upgrade across `SKILL.md` and `SECURITY.md` by how
  each one syncs: `SKILL.md` is create-only (delivered once per vault,
  never force-overwritten, so an owner's customization survives),
  `SECURITY.md` is force-synced to every deployed vault on the weekly
  `template-sync` run. Only the write-scope and commit-discipline pieces
  of the upgrade are genuinely security rules, so only those went into
  `SECURITY.md` — which means they're the only part of this change that
  reaches already-deployed kits without a redeploy.
- Declined to invent destination-file conventions for promoted content
  (no `preferences.md`/`decisions.md`/canon file exists in this
  template) and declined to guess a pending-item board. Picked GitHub
  Issues as the default pending mechanism, since it's infrastructure
  every deployed vault already has as a GitHub repo, and said so in
  `SKILL.md` explicitly as a flagged choice rather than an established
  convention — for the owner to confirm or override.
- Declined to migrate this repo's own existing flat index into the new
  Open/Archive format as part of the same change. The 10 pre-existing
  entries need per-entry triage judgment (promoted vs. resolved vs.
  still open) that a mechanical format change shouldn't make silently on
  their behalf — they're filed under `## Open`, unclassified, in this
  same pass instead, alongside this note's own entry.

## Workflow friction

- The task instructions warned against trusting a secondhand description
  of the propagation mechanism ("a prior audit verified one exists") and
  to confirm current state instead. That check mattered:
  `template-sync.yml` is real and on by default, but it force-syncs only
  `SECURITY.md`, not `SKILL.md` — so the most visible part of this
  change (the actual Open/Archive workflow) will not reach any
  already-deployed vault on its own. Worth remembering generally for
  this repo: "the sync workflow exists" and "this specific file reaches
  deployed vaults" are separate claims, and each force-synced path has
  to be checked individually rather than assumed from the workflow's
  existence.
