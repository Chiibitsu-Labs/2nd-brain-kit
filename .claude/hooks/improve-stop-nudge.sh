#!/bin/bash
# Stop hook: nudge toward capturing lessons via the improve skill. Blocks
# once (checks stop_hook_active so this can never loop) then lets the
# session end normally on the second pass.
# Part of the Second Brain Kit by Chiibitsu Labs (labs@chiibitsu.com).

# Needs `jq` (not preinstalled on macOS/Windows). If it's missing, skip the
# nudge and let the session end normally rather than erroring.
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
stop_hook_active=$(echo "$input" | jq -r '.stop_hook_active')
if [[ "$stop_hook_active" = "true" ]]; then
  exit 0
fi

# Claude Code fires Stop at the end of *every* assistant turn, not just
# when the user is actually done with the conversation — so blocking
# unconditionally here interrupts ordinary multi-turn sessions after
# nearly every response. Throttle instead: only actually nudge once per
# ~15 minutes, tracked via a small per-vault, git-ignored state file.
VAULT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_FILE="$VAULT_DIR/.claude/.improve-nudge-last"
THROTTLE_SECONDS=900

now=$(date +%s)
if [[ -f "$STATE_FILE" ]]; then
  last=$(cat "$STATE_FILE" 2>/dev/null)
  if [[ "$last" =~ ^[0-9]+$ ]] && (( now - last < THROTTLE_SECONDS )); then
    exit 0
  fi
fi

mkdir -p "$VAULT_DIR/.claude"
echo "$now" > "$STATE_FILE"

jq -n '{
  decision: "block",
  reason: "Before finishing: did this session have anything worth capturing with the improve skill — an AI mistake/correction, a preference the owner stated, workflow friction, or a decision made? If yes, run the improve skill now. If genuinely nothing stood out, just say so briefly and finish."
}'
exit 0
