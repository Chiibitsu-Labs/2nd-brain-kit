# Audit pack — vault path guards and injection hardening

Tier 3 cross-model audit per `04 — The Audit Protocol`. Completed pack,
committed before merge as the durable record: the PR description and its
review threads are forge metadata that `git clone` does not carry, so
this file is what a later session on any host reconstructs from.

| | |
|---|---|
| **Change** | Vault path guards + improve-skill security rules |
| **PR** | Chiibitsu-Labs/2nd-brain-kit#5 |
| **Branch** | `security/path-guard-and-injection-hardening` |
| **Audited head** | `0961d15` (diff `52a782b..0961d15`, 13 files, +3606/−52) |
| **Target tip at audit time** | `52a782b` (`main`) |
| **Builder** | Claude Code (Anthropic) |
| **Auditor** | Codex review bot (OpenAI) — cross-vendor, per thesis claim 2 |
| **Date** | 2026-08-10 |

The diff is identified by SHA range rather than inlined: it is in-repo
history, so a clone carries it, and pasting 3,600 lines here would make
the record harder to read without making it more durable.

## Tier 3 trigger

Multiple, any one of which suffices: this change is the authorization
boundary for a connector that holds `VAULT_GITHUB_TOKEN`; it rewrites
path handling (traversal surface); and it touches how untrusted
third-party text enters an agent's context. Doc 04's "your gut saying
this one matters" also applies — the pre-change connector let a crafted
path walk off the repo's `contents/` endpoint onto arbitrary
`api.github.com` endpoints with the token attached.

## What the change does

1. **One path boundary for all three verbs.** `resolveVaultPath()` now
   guards `read_file`, `list_files`, and `write_file`. Previously only
   writes were guarded, so reads handed raw input to the URL builder and
   `..` segments were resolved by the URL parser itself.
2. **Protection matches how paths resolve, not how they are spelled.**
   Comparison is done on a normalized key (per-segment trailing dots and
   spaces stripped, then lowercased), because Win32 strips trailing dots
   and spaces and a case-insensitive checkout aliases `.CLAUDE/` onto
   `.claude/`. Segments made only of dots and spaces are refused outright.
3. **Instruction-loading files are protected by basename at any depth** —
   `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `AGENTS.override.md`,
   `.mcp.json`, `.devcontainer.json` — plus prefixes for directories that
   execute: `.claude/`, `.github/`, `.obsidian/plugins/`, `.vscode/`,
   `.devcontainer/`, `.codex/`, `.agents/`, `vault-mcp/`, `tools/`,
   `.vercel/`. These are mandatory; the env var only adds.
4. **Auto-loaded note bodies are fenced** with a per-session random
   marker and labelled untrusted, and the improve skill's security rules
   are carried inline by the hook so they reach vaults whose own sync
   workflow cannot deliver `SECURITY.md`.
5. **Tier 1 gates added** (`.github/workflows/ci.yml`): typecheck,
   dependency audit, shell lint, and a 28-case behavioural suite.

## Risks the Builder believes this change carries

Stated plainly, before findings, per doc 04 step 1:

- **The guard list is an enumeration, and enumerations are incomplete by
  construction.** Every tool that loads a file as instructions adds a
  filename; this list tracks the ones known today. A tool shipping a new
  supported spelling silently reopens that channel. This is the change's
  weakest joint and no test can close it.
- **`protectionKey()` folds for comparison but does not resolve.** The
  fold and the traversal check have to agree about what a segment means;
  the `.. ` bypass (finding 12) was exactly that disagreement.
- **The fence is a labelling defence, not an enforcement one.** It marks
  untrusted text; it depends on the reading model honouring the label.
- **Delivery, not correctness, was the repeated failure mode.** Six of
  sixteen findings were about changes that were right but could not reach
  an already-deployed vault.

## Findings and resolutions

### Round 0 — independent adversarial audit at `f8931f4`

A session that did not write the code, re-deriving every claim by
execution. Five findings plus one minor note.

| # | Finding | Resolution |
|---|---|---|
| F-1 | HIGH — the security rules reach **zero** already-deployed vaults: `FORCE_SYNC_PATHS` lives in `.github/workflows/template-sync.yml`, which GitHub hard-blocks the Actions token from updating, so adding a force-synced path is the one operation the delivery mechanism cannot perform on itself | **FIXED** `56d5eb3`, `f204cf4` — the hook (already force-synced everywhere) carries the full rules inline when `SECURITY.md` is absent, and without needing `jq` |
| F-2 | HIGH — the fence is bypassable by filename: the same write privilege that reaches `ai-improvements/*.md` also reached `CLAUDE.md`, loaded into every session unfenced. `SECURITY.md` §2 *directs* standing instructions to `CLAUDE.md`, so both facts could not stand | **FIXED** `f5a1e8b` — basename protection at any depth, plus `.vscode/` and `.devcontainer/` prefixes |
| F-3 | MEDIUM — no Tier 1 CI existed; nothing was checked on any pull request | **FIXED** `55231e5` — typecheck, audit, shell lint, behavioural suite on `pull_request` |
| F-4 | MEDIUM — lockfile deliberately gitignored; 124 unpinned transitives re-resolved on every deploy of a server holding four secrets | **FIXED** `0133abc` — lockfile committed, CI uses `npm ci` |
| F-5 | LOW — `backup-mirror.yml` declared no `permissions:`, inheriting repo default while holding a push token for a second host | **FIXED** `9680b89` — scoped to `contents: read` |
| F-5b | Minor — `oauth/token/route.ts:10` calls `await req.json()` outside a `try`, so a malformed JSON body yields a 500 instead of a 400 | **DEFERRED** — still present, verified. No security consequence: it is a response-shape difference on a malformed request, and the route rejects the request either way. Deferred because the file is outside this PR's diff and a cosmetic fix here would reset the review gate for the whole security change. Founder's call whether it rides along; it should not be forgotten |

The auditor's own verdicts on the three findings it was asked to check:
F2 (traversal) **CLOSED**, 0 escapes across 27 vectors; F1 (note
injection) **MITIGATED, NOT CLOSED** — the fence held mechanically,
including against a guessed close marker, but F-2 routed around it; F3
(rules delivery) **STILL OPEN**. F-1 and F-2 above are what closed the
latter two.

### Round 1–5 — cross-vendor review bot

16 findings across 5 rounds. Every one answered per doc 04 step 4.
**FIXED: 16. DISPUTED: 0. DEFERRED: 0.**

| # | Finding | Resolution |
|---|---|---|
| 1 | `CLAUDE.local.md` writable — Claude Code loads it as project-local instructions | **FIXED** `1e1e376` — added to protected basenames |
| 2 | Root `.devcontainer.json` writable; only `.devcontainer/` was covered. Defines `postCreateCommand` | **FIXED** `1e1e376` — added as a protected basename |
| 3 | `AGENTS.override.md` writable; Codex prefers it over `AGENTS.md` | **FIXED** `6a63ac8` — added. Precedence claim could not be verified from here; asymmetry decided it (a wrong entry costs nothing, a missing one reopens the path) |
| 4 | New CI workflow never reaches already-deployed vaults | **FIXED** `ecd5b68` — added to the pending-workflow mechanism |
| 5 | Security rules unreachable without `jq` — the vaults most likely to lack it are the ones lacking `SECURITY.md` | **FIXED** `f204cf4` — rules escaped in pure bash and always emitted; `jq` kept only for untrusted note bodies |
| 6 | Note glob `[0-9]*.md` admits `9-README.md`, which sorts after every ISO date and evicts a real note | **FIXED** `f204cf4` — full date shape required |
| 7 | Saved note recorded the inverse of what the commit did | **FIXED** `94ef41f` — marked superseded |
| 8 | `.codex/config.toml` writable — sandbox policy, MCP servers, hooks | **FIXED** `6078263` — `.codex/` added to mandatory prefixes |
| 9 | Force-synced CI script never staged, so the sync PR would not carry it | **FIXED** `c1f87f5` — added to the staged pathspec |
| 10 | Syncing the whole `.github/scripts/` directory deletes owner-authored helpers via `rm -rf` | **FIXED** `9b7da2c` — force-sync by exact file path |
| 11 | An old vault can activate CI before any sync delivers the test script | **FIXED** `35e7765` — behavioural step skips loudly with a `::warning::` rather than failing |
| 12 | `notes/.. /.claude/hooks/x` bypasses every root protection: POSIX treats `.. ` as an ordinary folder, Win32 strips the space and opens the parent | **FIXED** `9e96c5e` — segments of only dots and spaces refused before normalization, covering all three verbs |
| 13 | `.agents/skills/<name>/SKILL.md` writable — another trusted instruction channel | **FIXED** `9e96c5e` — `.agents/` added to mandatory prefixes |
| 14 | Unquoted `.github/scripts/*.sh` with nullglob off makes the first CI run red where the directory does not exist yet | **FIXED** `c71730f` — single lint step, one glob expansion under `nullglob` |
| 15 | Glob still admits a slugless `2027-01-01.md`, which sorts ahead of every real note | **FIXED** `c71730f` — trailing `-?*` required; fixture test added |
| 16 | Saved note asserted a delivery order the CI design exists to survive without | **FIXED** `cd93882` — corrected, with the bootstrap gap stated |

### Tier 2 self-audit findings (same round, Builder's own review)

| # | Finding | Resolution |
|---|---|---|
| 17 | Test 2 asserted `grep "SECURITY.md"`, a string both branches emit, so the pointer branch was never exercised — pointing `SECURITY_FILE` at a nonexistent name still passed 26/26 | **FIXED** — asserts a pointer-only phrase and the fallback's absence. Verified by mutation: the same break now fails 2 tests |
| 18 | `make_vault`'s `cp` failed silently without `set -e`, so a missing source `SECURITY.md` would build a fallback vault under the other branch's name | **FIXED** — the copy now aborts the suite loudly |
| 19 | Note recorded the removed pointer-gating behaviour as current, unmarked, while the bullet beside it carried a superseded marker | **FIXED** — marked superseded with the reasoning that replaced it |

## Arbitration

None required — no finding was disputed.

## Gate status

**The PR review gate is OPEN.** Two consecutive cross-vendor reviews of
the tracked head with no unresolved findings, the target tip unmoved
across both.

| Pass | Reviewed head | Target tip | Verdict |
|---|---|---|---|
| 1 | `0a6a21c` | `52a782b` | Clean — no major issues |
| 2 | `39a0205` | `52a782b` | Clean — no major issues |
| 3 | `ef2851a` | `52a782b` | Clean — no major issues (confirming pass) |

Pass 3 was requested by the founder and is the one that makes the gate
unarguable. Passes 1 and 2 opened it, but three record-keeping commits
landed after them, and doc 04 grants the session-record exemption for one
landing after a clean pass — so resting the gate on that exemption
stretched twice would have been a weaker claim than simply reviewing the
real head. It cost one review cycle and removed the argument.

Both SHA pairs are recorded here rather than only in the thread, because
a PR shows the *current* target tip and never the one a past review ran
against — an unrecorded pair cannot be reconstructed later, and a gate
can look open for an integration nobody reviewed.

`39a0205` is a session-record commit (an improve note plus its index
line, no change to reviewed code). The founder ruled that improve notes
are this vault's equivalent of the `ops/tasks.md` HANDOFF sub-line, so
doc 04 step 2's exemption applies and pass 1 survived it. Recording the
ruling here because it is a canon decision that outlives this PR: the
exemption is written for a path this vault does not have, and a later
session reading only doc 04 would count these two passes as one.

**Open question for the retro, not for this PR.** The exemption grants
one landing after a clean pass, singular. This branch took three improve
notes in a day; at that rhythm the session-record rule and the gate will
collide again. Either notes batch to merge-time, or the allowance is per
pass rather than per streak.

Per doc 04's own caveat, recorded so an open gate is not mistaken for a
certificate: two clean passes mean two reviewers found nothing on two
occasions. The reviewer is non-deterministic; unchanged text can pass
twice and fail a third look. What carries weight here is Tier 1 (green at
`39a0205`), the behavioural suite, and the founder's judgment. The merge
decision is the founder's.

### The one deferral, now routed

F-5b (`req.json()` outside a `try`) is fixed in **PR #6**, branched from
`main` rather than added here, so this PR's audited diff stays frozen
where this pack records it. Investigating it surfaced two more faults in
the same block: a JSON array body also threw, and a JSON *string* body
was coerced and re-parsed as a query, so the declared content type was
not actually enforced. No security property changed — the PKCE,
signature, `redirect_uri` and single-use checks gate every request either
way.

Merge order matters: #6 currently runs only the mirror job, because the
CI workflow is part of *this* PR and has not reached `main`. Merging this
one first, then updating #6, is what puts #6 under the Tier 1 gates.

### State at the close of this audit

- Tier 1: green at `ef2851a` — typecheck, dependency audit, shell lint,
  28-case behavioural suite, mirror.
- Tier 2: 3 findings, all fixed.
- Tier 3: 21 findings across 6 rounds — 20 fixed, 0 disputed, 1 deferred
  and now routed to #6.
- PR review gate: open, 3 clean passes, target tip unmoved throughout.
- Tier 4: not run. It is the pre-launch pass, and this change does not
  yet face real users or real money. It becomes due before this kit ships
  to a client vault.

This is the last commit intended before merge; anything after it reopens
the gate.
