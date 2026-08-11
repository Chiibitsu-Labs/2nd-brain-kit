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
  reading this vault." Neither breadth nor a stated rule was missing: the
  guard already covered several vendors across a basename set, a prefix
  list and a root-file set, and the comment above them already described
  the class. What was missing was any check that implemented the class
  rather than a list of members, so a tool whose files matched no entry
  in any of the three sets met a guard that described the right boundary
  and did not apply it. The exact contents of those sets at the time are
  in the repository at `a41ae87`; restating them here has been wrong four
  times and the record is one `git show` away.
  Reproduced by driving the real `resolveVaultPath` and
  `protectedWriteReason`: `.cursorrules`, `.cursor/rules/*.mdc`,
  `.windsurfrules`, `GEMINI.md`, `.clinerules`, `.continue/config.json`
  and `.aider.conf.yml` were all writable. They divide into two kinds,
  and the first draft of this note collapsed them: `.cursorrules`,
  `.windsurfrules`, `GEMINI.md` and `.clinerules` are loaded verbatim as
  standing instructions, `.cursor/rules/*.mdc` files can supply agent
  instructions — some always applied, others selected by glob or by
  relevance, with MDC frontmatter read as metadata rather than prose, so
  the danger is that an attacker can write an always-applied rule rather
  than that every such file is read every time — while
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
  Everything without a leading dot is still enumeration — instruction
  files such as `CLAUDE.md` and `QWEN.md`, config files such as
  `opencode.json`, and non-dotted tool directories too, of which this
  repository already has one in `tools/` protected by an explicit prefix.
  The current entries are in the merged guard rather than listed here. A
  future `TOOL.md` or `agent/` reopens that side, and it cannot be closed
  the way the dotted side was: those names are indistinguishable from
  ordinary notes and folders, and a rule refusing all-caps markdown would
  refuse a great many real ones.

  Restating the rule in a comment was considered and rejected as the
  whole fix, because a comment stating the class was already present and
  had not stopped the enumeration falling behind it. The comment was
  still expanded, as documentation of what the check enforces — useful
  only because something now enforces part of it.
- The first fix covered six vendors and named the ones it had not
  attempted — Zed, JetBrains AI, Amp, Roo, Kilo — in the review request
  rather than bounding the gap quietly. Review then exercised several of
  them, and by the merge all had been reached: the shape rule closes
  `.zed/`, `.idea/`, `.roo/` and `.kilocode/` without naming them, and
  Amp's non-dotted `AGENT.md` was found and added explicitly. Stating the
  gap is what got it closed; the version that listed only what had been
  checked would have looked more complete and been less so.
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
