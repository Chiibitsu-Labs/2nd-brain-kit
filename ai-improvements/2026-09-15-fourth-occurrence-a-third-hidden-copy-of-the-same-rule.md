---
date: 2026-09-15
project: 2nd-brain-kit (PR #20 Codex review)
source: claude-code
tags: [ai-improvement, mistake]
---

## AI mistakes

Fourth occurrence of the same lesson as
[[2026-09-15-cross-vendor-audit-caught-two-of-my-own-claims]],
[[2026-09-15-same-pattern-again-missed-cross-reference-and-a-second-false-claim]], and
[[2026-09-15-third-occurrence-stale-summary-left-behind-again]] — consolidated onto that
line again rather than filed separately.

- `.claude/hooks/improve-session-start.sh` carries its own inline copy of the improve
  skill's write-scope rules, used as a fallback when a vault has no `SECURITY.md` yet. It
  is a **third** copy of the rule this PR widened (after `SECURITY.md` itself and
  `SKILL.md` §0's summary, both already caught and fixed) — and it went unfound by me
  across every earlier round, surfacing only when a *different* reviewer (Codex, not
  ChatGPT) looked at a *different* file than either had checked before. Two independent
  reviewers each found a different blind copy of the same rule; neither found all of them.

This sharpens what the pattern actually is: it's not "check the obvious cross-references,"
it's **"a rule with more than one home has as many places to go stale as it has copies,
and a targeted read of the section being edited will not surface copies the editor didn't
know existed."** A full-repo search for the rule's actual content (not just its own
section) is the only thing that would have caught this before a reviewer did. Worth
building into how this vault's owner (or future sessions) verify a rule change is actually
complete: grep for the old phrasing repo-wide, not just re-read the file being edited.
