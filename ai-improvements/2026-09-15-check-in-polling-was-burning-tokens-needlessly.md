---
date: 2026-09-15
project: 2nd-brain-kit (PR #20, watching for review/CI activity)
source: claude-code
tags: [ai-improvement, preference, decision]
---

## Preferences

- While driving PR #20 to green, defaulted to scheduling a recurring
  `send_later` check-in (every 45–120 min) any time nothing was
  actionable, even though the PR was already subscribed to GitHub
  activity webhooks that deliver real events (CI completion, new
  comments, reviews) on their own. The owner corrected this directly:
  "No check-ins unless otherwise necessary!!! It's burning tokens
  needlessly." Every one of those wakeups woke the session, read notifs,
  re-fetched PR state, found nothing new, and rescheduled — pure waste
  when a webhook would have delivered the same information for free the
  moment it existed.

## Decisions

- Saved the correction as a standing rule in the user-level
  `~/.claude/CLAUDE.md` (not a vault note) — per this skill's own
  `SECURITY.md` §2, a note is a record of what happened, never a place
  to carry standing directives into future sessions. The rule: only
  schedule a wakeup when polling is genuinely the only option (e.g.
  waiting out an external rate-limit reset with no event to hook into),
  and even then schedule once for the actual moment that matters, not a
  repeating "just in case" cadence. The one check-in still scheduled at
  the time of this correction (timed to a Codex usage-limit reset) was
  kept, since it fits that exception — nothing else was re-armed after.
