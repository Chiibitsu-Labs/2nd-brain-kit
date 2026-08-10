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
- The fixture blind spot recurred, and that is the finding rather than
  the bug. The inline-rules fallback had been verified across three vault
  states — deployed, synced, fresh — but every fixture ran with `jq`
  installed, because the machine building them had it. `jq` ships on
  neither macOS nor Windows, and the hook exited before reaching the
  rules when it was absent, so the fallback written specifically for
  already-deployed vaults reached nothing on exactly the platforms most
  likely to be one. This is the second time in the same session that a
  test environment quietly supplied a precondition the real world does
  not: first `SECURITY.md` copied into place by the fixture builder, then
  `jq` present on the test machine. Both times the tests passed and the
  feature was dead where it mattered.
- The tightened note glob was itself a regression, introduced one round
  earlier in this same branch as the fix for the README bug. Anchoring on
  `[0-9]` instead of the full date shape let `9-README.md` back in — and
  because it sorts after every `2026-…` name it was picked first, so the
  narrower fix reproduced the original bug rather than a milder version
  of it. Fixing a class of bug by tightening a pattern invites checking
  whether the new pattern still admits the same class.
- The security audit that drove much of this was itself wrong on one
  checkable point: it described all six dependency advisories as
  transitive through `next`, when three come through
  `mcp-handler` → `@modelcontextprotocol/sdk` → `@hono/node-server`. It
  had separately flagged `mcp-handler` as deserving attention while
  attributing its advisories elsewhere. Reports worth acting on are still
  worth re-deriving.
- The worst defect of the session was in the guard written to close the
  earlier ones. `protectionKey()` folded trailing dots and spaces so the
  comparison would match how Windows spells a filename — but a component
  like `.. ` sits between two path languages: POSIX reads it as an
  ordinary folder named "dot dot space" and leaves it alone, while Win32
  strips the trailing space and opens the *parent*. So
  `notes/.. /.claude/hooks/x.sh` passed every check and resolved to the
  real auto-run hook on a Windows checkout, and `notes/.. /package.json`
  reached the deploy config the same way. Both reproduced before fixing.
- The fold did not merely miss that case, it *created* it: `.. ` folds to
  the empty string, so the compared path became `notes//.claude/...`,
  which matches no protected prefix at all. A normalizer added for
  comparison widened the hole it was meant to close. The mistake was
  conceptual rather than a missed entry — folding a name is not resolving
  it, and the question that decides which file opens is resolution. The
  fix refuses such segments outright at `resolveVaultPath`, which also
  covers reads and lists rather than only writes.
- The CI-delivery change was wrong three consecutive times, each a layer
  below the previous fix: the force-sync list could not deliver itself,
  then the copy step wrote a file it never staged so the fix was inert,
  then the copy step used a directory-wide replace that would have
  deleted an owner's own scripts. Each was verified at the layer being
  changed and broken at the next one down.
- The directory-replace instance is the least excusable. The workflow's
  own comment states that nothing does a directory-wide replace anymore,
  precisely so a client's files are never touched — a comment read,
  quoted in a commit message earlier the same session, and then
  contradicted three lines above it. Reading a comment is not the same as
  checking a change against what it says.

## Preferences

- The owner stated that pull requests here follow the "vibeOS protocol":
  a Codex review iterated until twice clean, then mark ready for review,
  twice clean again, then merge. First described while saying they had
  handled #5 that way manually, which was initially read as "the owner
  moves these states themselves". They then corrected that: the
  assistant should drive the loop — request each Codex round, fix what
  comes back, and keep going until the gate is open — rather than waiting
  to be asked each time. The correction is the useful part: describing
  how something was done once is not the same as saying it must keep
  being done that way, and the first reading assumed it was.
- A green CI run and a clean review round were treated as different
  claims from "the code is correct", and the owner did not object to that
  framing. Every review round on #5 so far surfaced something real,
  including in code that had just been written and verified.

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
  emitting no pointer. — **Superseded later the same day.** Emitting
  nothing turned out to be the worst of the three options: the vaults
  that lack SECURITY.md are exactly the already-deployed ones whose own
  sync workflow cannot deliver it, so "until the next sync" meant never.
  The hook now carries the full rules inline in that branch and points at
  the file only where it exists.
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
  were initially left — **superseded later the same day; see the entry
  below, all five ended up done.** The split was drawn on whether the
  finding was a defect in a claim the PR itself made — the undelivered
  rules and the writable `CLAUDE.md`, both fixed — versus a standing
  policy decision: adding PR CI, committing a lockfile that is
  deliberately gitignored, and scoping a workflow token. The owner was
  asked about those three and the question initially went unanswered, so
  they were held rather than decided unilaterally. They interlock: the
  proposed CI runs `npm ci`, which needs the committed lockfile to exist
  first.
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
- The hook's dependency on `jq` was split rather than removed: the
  rules, being this script's own static text, are escaped in pure bash
  and always emitted, while note bodies still require `jq`. Hand-rolled
  escaping of arbitrary file content is its own bug factory, so the
  dependency was kept exactly where the content is untrusted and dropped
  where it is not. Losing notes to a missing helper is an inconvenience;
  losing the rules is a security hole.
- `agents.override.md` was added to the protected set even though its
  claimed precedence over `AGENTS.md` could not be verified from here.
  The asymmetry decided it: no legitimate note carries that name, so a
  wrong entry costs nothing, while a missing one reopens the whole path.
  The unverified status was stated in the commit and on the PR rather
  than presented as confirmed.
- The CI script is force-synced while the workflow that calls it can only
  arrive by human paste, and the intended ordering is that the script
  lands first, so a pasted `ci.yml` runs instead of failing on a missing
  file. That ordering is not guaranteed for a vault deployed before this
  change: its *old* sync workflow has no force-sync entry for the script,
  so the first run can advertise the new `ci.yml` without being able to
  deliver the script it calls, and an owner who pastes promptly gets CI
  before the script. Same delivery trap as the SECURITY.md one — a change
  to what gets delivered cannot deliver itself — which is why both CI
  steps that touch the script tolerate its absence rather than assuming
  the ordering held.
- Waiting on CI by backgrounding a shell loop of `sleep` calls was the
  wrong instrument — it produced no signal and had to be stopped. Polling
  the checks directly answered it in one call.
- The behavioural-test step in CI skips when its script is missing rather
  than failing, because a vault that pastes `ci.yml` before a sync has
  delivered the script would otherwise go red for something its owner
  neither caused nor could fix. The skip is deliberately loud — a
  `::warning::` saying the suite did not run — on the reasoning that a
  silent skip is exactly how a deleted test suite becomes a green build.
  Visibly incomplete was preferred to quietly passing.
- Verification moved from inspecting the changed line to simulating the
  mechanism end to end, after three delivery fixes in a row passed the
  first and failed the second. Simulating a vault with an owner-authored
  script beside the kit's is what showed the directory replace deleting
  it; reading the loop had not.
- The note-selection glob was tightened three times, and each near-miss
  taught the same thing: `*.md` admitted `README.md`, `[0-9]*.md`
  admitted `9-README.md`, and the full date without a slug admitted
  `2027-01-01.md`. Every one of them sorted after the real entries and
  evicted a note. Approximating the documented filename kept leaving a
  gap one character further in; matching what `SKILL.md` actually
  specifies — date, separator, non-empty slug — is what closed it.
