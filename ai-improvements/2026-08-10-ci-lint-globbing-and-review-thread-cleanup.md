---
date: 2026-08-10
project: 2nd-brain-kit (CI shell linting + PR #5 review cleanup)
source: claude-code
tags: [ai-improvement, mistake, friction, decision]
---

## AI mistakes

- The CI step `bash -n .claude/hooks/*.sh .github/scripts/*.sh` did not
  check what it appeared to check. `bash -n a.sh b.sh` parses only `a.sh`
  and passes the remaining names to it as positional arguments, exiting 0
  however broken they are — so the syntax gate covered exactly one file
  while reading, in the workflow log, as though it covered all of them.
  It was written as a one-liner because the shellcheck line beside it
  accepts multiple files and the two looked symmetric. They aren't. The
  fix is a loop, one invocation per file, and that shape is worth keeping
  even though it looks more verbose than it needs to.
- The same step also passed `.github/scripts/*.sh` unquoted with nullglob
  off. In a vault where that directory doesn't exist yet, bash hands the
  literal unexpanded pattern to shellcheck, which fails on a nonexistent
  path — turning the first CI run red for a reason the owner neither
  caused nor could fix, which is the exact failure the tolerant
  behavioural step further down the same job existed to prevent. One job
  had two steps reasoning from opposite assumptions about whether the
  scripts directory is present.
- A durable note claimed the force-synced test script always lands before
  a pasted `ci.yml`. That is only true once the *updated* sync workflow is
  installed — a vault deployed before the change runs the old one, which
  can advertise the new `ci.yml` without being able to deliver the script
  it calls. The claim mattered more than an ordinary inaccuracy would,
  because the session-start hook reloads that note into every future
  session, so a wrong delivery model would be handed forward as
  established fact and could justify removing the tolerance CI now
  carries.

## Workflow friction

- Two `claude-code-remote` MCP tools — `subscribe_pr_activity` and
  `send_later` — returned "requires approval" in this non-interactive
  session. The GitHub MCP server's own `subscribe_pr_activity` worked, so
  PR watching was recoverable, but the hourly self check-in was not: the
  subscription now depends on webhooks alone, which don't reliably
  deliver CI success or merge-conflict transitions.
- `actions_list` for one branch returned ~352KB and exceeded the tool
  output limit. Reading the saved file with a small `python3 -c` slice
  that printed only id/name/sha/conclusion per run answered the question
  in one call; the failure mode is asking a list endpoint for everything
  when four fields per row were wanted.

## Decisions

- Sixteen review threads were closed by resolving them rather than by
  replying to each. Nine were already fixed in earlier commits on the
  branch and were re-verified against current code before resolving; the
  rest were addressed by this session's commits or already marked
  outdated. The diff is the record — sixteen "fixed in <sha>" replies
  would have buried it.
- The slug requirement added to the note-selection glob was covered by a
  new fixture test rather than only by the code change, on the grounds
  that the two previous versions of this same glob were both wrong in the
  same direction and neither was caught by reading it.
