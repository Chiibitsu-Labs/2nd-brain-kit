---
date: 2026-09-15
project: 2nd-brain-kit (PR #20 review round)
source: claude-code
tags: [ai-improvement, mistake, decision, preference]
---

## AI mistakes

- Wrote `SECURITY.md` §5's commit-discipline rule ("same commit or none")
  as a single claim covering both the git/local path and the remote
  vault connector path, without separately verifying it held for the
  connector. It didn't: the connector's `write_file` tool calls the
  GitHub Contents API once per file, with no multi-file transaction, so
  "same commit or none" was false for that path from the moment it was
  written. A cross-vendor (ChatGPT) review caught it; checking the
  connector's actual code (`vault-mcp/app/api/[transport]/route.ts`)
  confirmed the finding before accepting it. The lesson isn't "the
  reviewer was right" so much as: a claim about mechanism in a file
  whose whole job is being trustworthy needs to be checked against every
  path it claims to cover, not just the one path most recently in mind
  while writing it.
- Wrote a "promote on duplicate" procedure whose own worked-through logic
  contradicted its stated goal: it said "don't leave two lines
  describing the same thing," then the steps immediately below only
  stamped and archived the newly-filed note, leaving the original
  duplicate sitting in `## Open` forever — the two-line state the rule
  existed to prevent. Read the procedure at the level of "what actually
  happens if you follow these steps," not just "does this sentence sound
  right," would have caught it before a reviewer had to.

## Decisions

- Fixed the propagation gap (an earlier note's finding: `SKILL.md`'s
  workflow upgrade reaches zero already-deployed vaults, being
  create-only) by extending `template-sync.yml` with a
  `PENDING_SKILL_UPDATE.md` mechanism — mirrors the existing
  `PENDING_WORKFLOW_UPDATE.md` pattern exactly (never auto-applies,
  surfaces the new content for a manual merge) rather than inventing a
  new convention or force-syncing and destroying owner customization.
  Verified the three code paths (fresh vault, local differs, local
  matches) in an isolated simulation before committing, not just by
  reading the diff.

## Preferences

- The owner asked for iterative audit rounds on this PR: keep sending
  updated audit packs to ChatGPT and fixing what comes back, until two
  consecutive passes are clean — not a one-shot review.
