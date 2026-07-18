---
name: improve
description: Reviews the current conversation for lessons worth remembering — AI mistakes/corrections, the vault owner's preferences, workflow friction, and decisions made — and saves them as a dated note in this vault, updating a running index. Invoke on demand ("/improve", "save lessons", "log what we learned"), or when nudged by the session's Stop hook at the end of a conversation.
---

# improve

Turns an AI work session into a permanent note in this vault, so future
sessions can load it as context and serve the owner better. Write-side of
a read/write pair — a SessionStart hook auto-loads past notes back in.

## 1. Find the vault

Try in order, stop at the first that works:

1. **Already in it** — if `$CLAUDE_PROJECT_DIR` (or cwd) contains `00_moc/` and an `About-This-Vault.md`, you're already there. Operate directly.
2. **Remote vault connector** — if vault connector tools (read_file / write_file / list_files) are available, use those instead of the filesystem.
3. **Neither** — ask the owner where the vault is (don't guess, don't skip silently).

## 2. Review the conversation

Read back over the conversation and pull out anything that fits:

- **AI mistakes / corrections** — times the assistant (you) got something wrong, made a bad assumption, or had to be corrected. Be honest and specific about what went wrong, not vague.
- **Preferences** — standing preferences the owner stated that should carry forward (style, tools, how they like things done, tone).
- **Workflow friction** — tooling or process pain points that slowed things down.
- **Decisions made** — real decisions reached and the reasoning behind them, not just the action taken.
- **Anything else** — if something seems worth capturing but doesn't cleanly fit the above, or you're genuinely unsure, **ask the owner directly** rather than silently deciding either way.

> **Customize me:** add this owner's own categories here — client work,
> content ideas, billing decisions, family logistics — whatever they want
> remembered. This section is meant to be edited during onboarding.

If nothing substantive falls into any category, say so and stop — don't
write a note just to have written one. Empty/filler notes make the index
useless.

## 3. Write the note

- **Path**: `ai-improvements/YYYY-MM-DD-<slug>.md`, where `<slug>` is a short kebab-case description of the session's topic. If a file for that date+slug already exists (second session, same topic, same day), append `-2`, `-3`, etc.
- **Frontmatter**:
  ```yaml
  ---
  date: YYYY-MM-DD
  project: <what the session was working on, or "general">
  source: <claude-code | claude | chatgpt>
  tags: [ai-improvement, <one or more of: mistake, preference, friction, decision>]
  ---
  ```
- **Body**: one `##` heading per category that actually has content (skip empty ones) — `## AI mistakes`, `## Preferences`, `## Workflow friction`, `## Decisions`, `## Other`. Concrete bullets, not vague summaries.

## 4. Update the index

`00_moc/AI Improvements Index.md` — a flat reverse-chronological list of
links. If it doesn't exist, create it first: title, one-line description,
then the list. Add one line at the top of the list:
```
- [[YYYY-MM-DD-<slug>]] — <one-line summary> (YYYY-MM-DD)
```

## 5. Save

- Working via the remote vault connector: use its write tool for both files.
- Working on a local clone (Claude Code): `git add` the two files by exact path (never `-A` or `.`), then commit with `git commit --only -- <path1> <path2> -m "Improve: <one-line summary>"` — the `--only` restricts the commit to exactly those two paths regardless of anything else already staged in the index (a plain `git commit` after `git add` commits *everything* staged, which could silently sweep in unrelated in-progress work). Push to the current branch.

## 6. Tell the owner

Short confirmation in chat: what got captured, in one or two sentences,
plus the file path. Not a full re-print of the note.

## Read past notes (the other half of the loop)

This skill is paired with a `SessionStart` hook
(`.claude/hooks/improve-session-start.sh`) that automatically loads the
index + most recent entries as context at the start of every Claude Code
session in this vault. On Claude/ChatGPT web and apps, ask the skill to
read recent notes at the start of important conversations.

---
*Part of the Second Brain Kit by Chiibitsu Labs — chiibitsu.com · labs@chiibitsu.com*
