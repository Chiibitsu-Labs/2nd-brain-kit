---
date: 2026-09-15
project: 2nd-brain-kit (PR #20/#21 review loop)
source: claude-code
tags: [ai-improvement, decision, friction]
---

## Decisions

- Assumed each cross-vendor review round needed a freshly generated audit-pack file to
  paste into ChatGPT, and kept producing one every round on that assumption. Round 2's own
  verdict text said plainly it "audited the live PR head, not only the attached pack" —
  meaning the owner's ChatGPT setup already reads GitHub PRs directly. Confirmed with the
  owner and settled on: point ChatGPT at the PR and my response comments directly going
  forward; only build a fresh pack when actually asked for one. The packs weren't wrong to
  make the first time (better to over-provide context before knowing the setup could fetch
  it itself), but continuing to generate one by default every round afterward would have
  been unnecessary work repeated on a stale assumption.

## Workflow friction

- Nothing here was mis-set-up or broken — this was an assumption I made and didn't check
  (does the reviewer need a pushed context, or can it pull one) until the reviewer's own
  output answered the question. Worth generalizing: when a review or audit loop repeats
  across multiple rounds, checking what the reviewing party can already reach on its own
  is worth doing once, early, rather than re-deriving "what context does this round need"
  from scratch each time.
