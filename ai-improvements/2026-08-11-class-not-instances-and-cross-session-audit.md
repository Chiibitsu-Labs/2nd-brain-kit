---
date: 2026-08-11
project: 2nd-brain-kit (pre-handover hardening, cross-session audit)
source: claude-code
tags: [ai-improvement, mistake, decision]
---

## AI mistakes

- Asked to consult another Claude session, the reply given was that a
  session's assurance is not evidence and the repository is the artifact.
  The principle holds; applying it before looking at what was actually at
  the other end did not. The session turned out to be the one that owns
  the vibeOS protocol documents, sitting idle and blocked, with a status
  line offering to attach this repo read-only and audit it. It was not a
  peer to ask for reassurance — it was a reviewer with context this repo
  cannot supply, and dismissing the channel on a general rule nearly
  discarded a real audit. The audit it then produced found a live hole.
- A claim that the OAuth token deferrals existed "only in a PR thread,
  not in any durable record" was wrong. The vibeOS session reports them
  ticketed in its own `ops/tasks.md`. The error came from treating this
  repository as the whole record when the system spans several: a
  deferral can be properly ticketed somewhere this session cannot see.
  Claims about what is recorded were scoped to "in this tree" everywhere
  else in these notes, and that scoping was dropped for this one.
- The write guard's protected-name list was found to enumerate the
  instances its authors already knew about rather than the class the
  guard's own refusal message names — "loaded as instructions by agents
  reading this vault." Not a single-vendor list: the basenames already
  held Claude Code's memory files, Codex's `AGENTS.md`, `.mcp.json` and
  `.devcontainer.json`, and `.codex/` was covered separately as a
  protected prefix. The rule was not missing either: the comment
  immediately above the list already said the set covered files loaded as
  instructions by agents, anywhere in the tree. Stating the rule and
  listing several vendors is what made it look complete — the gap was
  that nothing enforced the rule except the list, so every tool outside
  it walked through a guard that described the right boundary.
  Reproduced by driving the real `resolveVaultPath` and
  `protectedWriteReason`: `.cursorrules`, `.cursor/rules/*.mdc`,
  `.windsurfrules`, `GEMINI.md`, `.clinerules`, `.continue/config.json`
  and `.aider.conf.yml` were all writable. They divide into two kinds,
  and the first draft of this note collapsed them: `.cursorrules`,
  `.cursor/rules/*.mdc`, `.windsurfrules`, `GEMINI.md` and `.clinerules`
  are loaded verbatim as standing instructions, while
  `.continue/config.json` and `.aider.conf.yml` are configuration —
  dangerous because they set what a tool runs and which models and
  servers it reaches, not because their text is read as a directive.

  This is the same finding as the earlier "the fence is bypassable by
  filename", which was closed by adding three names — `CLAUDE.md`,
  `AGENTS.md`, `.mcp.json`. Naming the instances an audit happened to
  list left the class open, so the finding stayed closed only while the
  vault was opened in the editors those names cover. The same pattern
  had already been recorded twice in prose notes; this instance was in
  code, with a security consequence, and was found by an outside reviewer
  rather than by the sweep the earlier notes describe.

  A second instance sat beside it: `.obsidian/plugins/` was protected, so
  the connector could not ship plugin JavaScript, while
  `.obsidian/community-plugins.json` — the list of *enabled* plugins —
  was writable, allowing a dormant plugin already on disk to be switched
  on without writing any executable code.

## Decisions

- The fix enforces one part of the rule and still enumerates the rest.
  Writes are refused to any path with a dot-leading segment, which closes
  dot-leading tool directories including ones that do not exist yet.
  Everything without a leading dot is still enumeration: the instruction
  and config files — `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `QWEN.md`,
  `WARP.md`, `opencode.json` and its JSONC spelling — and non-dotted tool
  directories too, of which this repository already has one in `tools/`,
  protected by an explicit prefix. A future `TOOL.md` or `agent/` reopens
  that side. It cannot be closed the way the dotted side was: those names
  are indistinguishable from ordinary notes and folders, and a rule
  refusing all-caps markdown would refuse a great many real ones.

  Restating the rule in a comment was considered and rejected as the
  whole fix, because a comment stating the class was already present and
  had not stopped the enumeration falling behind it. The comment was
  still expanded, as documentation of what the check enforces — useful
  only because something now enforces part of it.
- Six vendors were covered and the gap was left open and named rather
  than quietly bounded: Zed, JetBrains AI, Amp, Roo and Kilo were not
  attempted, and the review request said so.
- The `typ` claim on OAuth tokens was not added, though the vibeOS
  session recommended it before handover and the reasoning was accepted.
  Requiring `typ` invalidates every token already issued, including the
  owner's live session, which makes it a breaking change rather than a
  hardening tweak, and the owner was away.
- The OAuth deferrals — 30-day TTL, constant `sub`, no `jti`, one signing
  secret across three token types — were arbitrated at a time when the
  owner was the only person exposed to them. When a third party's
  deployment came up, this session judged that the premise behind that
  arbitration had changed although the code had not, and put the question
  back to the owner rather than treating the earlier decision as still
  settled. The owner had not answered at the time of writing.
- The note for this session was written on a branch cut from `main`
  rather than onto the open pull request, so the note commit could not
  reset the review count on a security fix awaiting its passes.

## Other

- A restore drill was run against `backup/2026-W33`, the first restore
  this vault has evidence of. The documented path worked: the tag checked
  out into a clean clone, all nine markdown files present and non-empty,
  and `daily/` and `notes/` byte-identical to `main`. The gap found was
  freshness rather than integrity — the snapshot was 54 commits behind,
  both existing tags pointed at the same commit, and it predated the
  committed lockfile, so a restored connector would fail `npm ci`.
