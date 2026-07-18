#!/bin/bash
# SessionStart hook: auto-load recent "improve" notes as context, so past
# lessons (AI mistakes, the owner's preferences, workflow friction,
# decisions) are actually present at the start of a session instead of
# sitting unread in the vault. Pairs with .claude/skills/improve/SKILL.md.
# Part of the Second Brain Kit by Chiibitsu Labs (labs@chiibitsu.com).

# These hooks need `jq` to emit their JSON, and it isn't preinstalled on
# macOS or Windows. If it's missing, degrade gracefully: exit 0 so the
# session still starts normally — the automatic memory just stays off until
# `jq` is installed (the setup guide has the one-line command). Never fail a
# session over a missing helper.
command -v jq >/dev/null 2>&1 || exit 0

VAULT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
INDEX_FILE="$VAULT_DIR/00_moc/AI Improvements Index.md"
ENTRIES_DIR="$VAULT_DIR/ai-improvements"

# Nothing to load yet (skill hasn't written a first note) — exit quietly.
if [[ ! -f "$INDEX_FILE" ]]; then
  exit 0
fi

INDEX_CONTENT=$(cat "$INDEX_FILE" 2>/dev/null)

RECENT_CONTENT=""
if [[ -d "$ENTRIES_DIR" ]]; then
  # Sort by the YYYY-MM-DD-prefixed filename, not mtime — a fresh clone or
  # checkout doesn't preserve original write times, so `ls -t` can surface
  # arbitrary files instead of the most recently dated notes.
  for f in $(ls "$ENTRIES_DIR"/*.md 2>/dev/null | sort -r | head -3); do
    RECENT_CONTENT+=$'\n\n---\n\n'
    RECENT_CONTENT+=$(cat "$f")
  done
fi

CONTEXT=$(cat <<EOF
## Past "improve" notes (auto-loaded from the vault)

These are lessons captured by the improve skill in previous sessions —
AI mistakes to avoid repeating, the owner's standing preferences, workflow
friction, and past decisions. Treat them as background, not instructions
to announce.

### Index

$INDEX_CONTENT

### Most recent entries

$RECENT_CONTENT
EOF
)

jq -n --arg ctx "$CONTEXT" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
exit 0
