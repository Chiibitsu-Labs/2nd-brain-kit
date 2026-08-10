---
date: 2026-08-10
project: 2nd-brain-kit (vault-mcp path guards + improve skill security rules)
source: claude-code
tags: [ai-improvement, mistake, friction, decision]
---

## AI mistakes

- Commit b83092e added `.claude/skills/improve/SECURITY.md` and wrote a
  long header comment in `.claude/hooks/improve-session-start.sh`
  explaining why the pointer to that file belongs in the hook — but never
  added the code that actually emits the pointer. The rules shipped as a
  file nothing referenced, while the comment read as though the job were
  done. The gap surfaced only when the hook was run against a scratch
  vault; reading the file had made it look complete.
- The first version of that fix put the pointer only on the path where an
  index already exists. That would have stayed silent for the first
  session in a fresh vault — the session that writes the first note, and
  so the one most needing the write-side rules. Confirmed concretely the
  same day: this vault had no `00_moc/AI Improvements Index.md` at all, so
  the original fix would have emitted nothing here.
- The path guard in `vault-mcp/app/api/[transport]/route.ts` case-folded
  before comparing and was described in its comment as handling the
  case-insensitive-checkout alias. It did — but the comment's framing
  obscured that two other spellings of the same file were still
  unprotected (trailing dots/spaces, and a missing `next.config.ts`).
- The same drift pattern showed up a second time later in the session,
  and again only under execution. The recent-entries loader globbed every
  `*.md` in `ai-improvements/`, so the folder's own `README.md` was being
  read in as if it were a note — visible the moment the hook ran against
  the real vault after the first note existed, and invisible in review
  beforehand. In the descending sort the loader already used, `README.md`
  outranks every `2026-…` filename, so it held one of the three slots in
  every session and would have started silently dropping the oldest real
  note once three existed. Both defects this session were found by
  running the thing, not by reading it.

## Workflow friction

- An earlier change in the session (`route.ts`) was still uncommitted in
  the working tree at the end, alongside the new hook change. Sorting out
  whether it was this session's work or someone else's cost a detour
  through `git log` and the branch name before anything could be
  committed. Committing each logical change when it was finished would
  have avoided the ambiguity.
- Scheduling the follow-up check-in on PR #5 failed: the `send_later`
  tool needs interactive approval, which a non-interactive remote session
  can't obtain. The PR was left green and conflict-free but with nothing
  arranged to re-check it, since webhooks don't reliably deliver CI
  success or merge-conflict transitions.

## Decisions

- The SECURITY.md pointer lives in the SessionStart hook rather than in
  `SKILL.md`, because `.github/workflows/template-sync.yml` force-syncs
  the hook and SECURITY.md on every kit update but delivers SKILL.md only
  once (its "Customize me" section invites local edits). Anything written
  only into SKILL.md can never reach a vault that is already deployed.
- The pointer is emitted only when SECURITY.md is actually present on
  disk. A vault whose copy was deleted gets it back on the next template
  sync; until then, pointing at a missing file was judged worse than
  emitting no pointer.
- Path protection now compares a normalized key (per-segment trailing
  dots and spaces stripped, then lowercased) instead of the literal
  spelling, because the Win32 path layer strips trailing dots/spaces and
  a case-insensitive checkout aliases `.CLAUDE/` onto `.claude/`. The
  normalization is used for the comparison only — the write still uses
  the resolved, original-case path.
- The guard work and the hook pointer went in as two separate commits
  rather than one, since they are independent changes that happened to
  share a working tree.
