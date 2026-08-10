---
date: 2026-08-10
project: 2nd-brain-kit (vault-mcp path guards + improve skill security rules)
source: claude-code
tags: [ai-improvement, mistake, preference, friction, decision]
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
- An independent security audit on PR #5 then found the pointer fix
  itself did not work where it mattered, and the root cause was a level
  above the code. `SECURITY.md` was added to the force-sync list *in the
  same PR*, and that list lives inside `.github/workflows/template-sync.yml`,
  which GitHub hard-blocks the Actions token from updating — a limit that
  file's own header documents. So adding a force-synced path is the one
  operation that delivery mechanism cannot perform on itself: an
  already-deployed vault receives the updated hook and never the file the
  hook points at, and the `-f "$SECURITY_FILE"` gate then emits nothing.
  Deployed vaults got the untrusted-content fence with none of the
  write-side rules. The recorded reasoning ("put the rules where sync can
  reach them") was right about `SECURITY.md` and `SKILL.md` and stopped
  one level short of the list itself.
- The verification that missed it was the more instructive part. Each
  scratch vault used to test the hook was built by copying `SECURITY.md`
  into place first, so every fixture guaranteed the precondition that
  real deployed vaults would not supply. The tests confirmed the hook
  emitted a pointer when the file was present; nothing asked whether the
  file would ever arrive.
- The same audit found the note fence was bypassable by filename. Fencing
  note bodies assumed notes were the channel an attacker would use, while
  the identical write privilege also reached `CLAUDE.md`, which is loaded
  into every session verbatim and unfenced. The fence held mechanically
  under test — verified against six escape attempts — which was true and
  beside the point, because the unmeasured channel stayed open. Sharpest
  evidence it was real: `SECURITY.md` §2, added by that same PR, directs
  standing instructions *to* `CLAUDE.md` as the trusted diff-reviewable
  channel, which only holds if the connector cannot write it.
- Immediately after fixing that gap, a Codex review found two more
  spellings the new list missed: `CLAUDE.local.md`, which Claude Code
  loads as project-local instructions in its own right, and the root
  `.devcontainer.json` form, which the `.devcontainer/` prefix does not
  cover. Both were the same failure as the one just fixed, one level
  finer: the list had been written from the canonical name of each file
  rather than from every spelling the tools actually accept. For a
  protected-name set specifically, a missed spelling is not a partial
  gap — it reopens the whole path.
- Writing the CI test suite surfaced another defect that had survived
  every prior read of the file: shellcheck's SC2012 on parsing `ls`
  output to pick recent notes. The surrounding comment had already
  worried in prose about spaces in Obsidian vault paths like
  `My Vault/`, while the code directly under it still parsed `ls`.
- The security audit that drove much of this was itself wrong on one
  checkable point: it described all six dependency advisories as
  transitive through `next`, when three come through
  `mcp-handler` → `@modelcontextprotocol/sdk` → `@hono/node-server`. It
  had separately flagged `mcp-handler` as deserving attention while
  attributing its advisories elsewhere. Reports worth acting on are still
  worth re-deriving.

## Preferences

- The owner stated that pull requests here follow the "vibeOS protocol":
  a Codex review, iterated until twice clean, then mark ready for review,
  twice clean again, then merge — and that they drive those state
  transitions themselves rather than having them done for them. They said
  they had already handled #5 that way manually. Read as: the PR's
  draft/ready/merge state is the owner's to move, and review rounds are
  expected to repeat until two consecutive clean passes, not merged on
  the first green.

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
- Of the audit's five findings, two were fixed on the branch and three
  were left. The split was drawn on whether the finding was a defect in a
  claim the PR itself made — the undelivered rules and the writable
  `CLAUDE.md`, both fixed — versus a standing policy decision: adding PR
  CI, committing a lockfile that is deliberately gitignored, and scoping
  a workflow token. The owner was asked about those three and the
  question went unanswered, so they were left untouched rather than
  decided unilaterally. They interlock: the proposed CI runs `npm ci`,
  which needs the committed lockfile to exist first.
- The audit's findings were re-derived by execution before any were
  acted on, rather than accepted from the report. All five reproduced.
  One detail in it did not survive contact: it proposed `bash -n` in CI
  for the hooks, but neither bash defect in this branch was a syntax
  error — both were behavioural and appeared only when the hook ran
  against a realistic vault, so parsing alone would have caught neither.
- The owner later approved all three deferred findings, and they landed
  with two calls worth recording. First, the CI dependency-audit gate was
  set at `critical` rather than `high`: all six current advisories are
  unfixable from this repo (`npm audit fix` is a no-op, since `next` and
  `mcp-handler` are already at their latest versions and it is their
  pinned transitives that carry the advisories), so a `high` gate would
  have merged red and stayed red, and a permanently red check stops being
  read. The full advisory list prints on every run so movement stays
  visible; the gate covers only what is actionable. Second, the hooks job
  runs a behavioural fixture suite rather than only `bash -n` and
  shellcheck, on the evidence that every defect these hooks have shipped
  was syntactically valid.
- Waiting on CI by backgrounding a shell loop of `sleep` calls was the
  wrong instrument — it produced no signal and had to be stopped. Polling
  the checks directly answered it in one call.
