---
date: 2026-08-10
project: 2nd-brain-kit (vibeOS audit protocol applied to PR #5)
source: claude-code
tags: [ai-improvement, mistake, friction, decision]
---

## AI mistakes

- A test in the behavioural suite could not fail. Test 2 claimed to check
  that a vault *with* `SECURITY.md` gets pointed at it, and asserted
  `grep -q "SECURITY.md"` — but the fallback branch names the file too,
  while explaining that it is missing, so the assertion passed on both
  branches and the one being tested was never exercised. Mutating the
  hook to look for a nonexistent filename still produced `passed: 26
  failed: 0`. The suite had been treated as evidence in three separate
  reports before the self-audit caught it. An assertion has to
  discriminate between the branches it claims to distinguish, and the
  only way that gets confirmed is by breaking the code and watching the
  test go red.
- The fixture builder's `cp` of `SECURITY.md` had no failure check, in a
  script deliberately run without `set -e`. A missing source file would
  have silently produced a vault with no `SECURITY.md` under the name
  `with_security` — the fixture would have been testing the opposite
  branch from the one its name promised.
- Sixteen resolved review threads were briefly treated as though they
  moved the review gate. They do not: the gate counts clean passes
  against the *current* head, and the cross-vendor reviewer had last read
  a commit six behind. Resolving a thread records that a finding was
  answered; only a review that reads the current diff and returns nothing
  is a pass.

## Workflow friction

- The cross-vendor review bot only runs on three triggers — PR opened,
  draft marked ready, or an explicit `@codex review` comment. It does not
  review on push. Every commit therefore silently leaves the gate at zero
  until the implementer asks again, and the failure mode is quiet:
  the PR looks reviewed because reviews exist, just not of this code.

## Decisions

- The completed audit pack was committed to
  `product/audits/vault-path-guards-and-injection-hardening.md` rather
  than left in PR threads, because PR descriptions and review threads are
  forge metadata that `git clone` does not carry. The diff is identified
  by SHA range instead of inlined — a clone already carries the history,
  and 3,600 pasted lines would make the record less readable without
  making it more durable.
- One finding was recorded as deferred rather than fixed: the OAuth token
  route parses a JSON body outside a `try`, returning 500 instead of 400
  on malformed input. Two reasons, both recorded — no security
  consequence, since the request is rejected either way, and the file
  sits outside this branch's diff, so touching it would reset the review
  gate for the whole security change on a cosmetic edit. Recorded as an
  open item for the owner to route rather than dropped.
- The review request states the bar and names what is out of scope, on
  the reasoning that a reviewer asked only to "find problems" in an
  unbounded surface never terminates — each fix grows the surface read
  next round.
- Both SHAs were recorded with the request: the reviewed head and the
  target branch's tip. A PR only ever shows the *current* target tip, so
  an unrecorded pair cannot be reconstructed later, and a gate can look
  open for an integration nobody reviewed.
