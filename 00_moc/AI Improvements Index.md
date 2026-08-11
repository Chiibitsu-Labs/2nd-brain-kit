# AI Improvements Index

Lessons captured from AI work sessions in this vault — mistakes worth not
repeating, standing preferences, workflow friction, and decisions and
their reasoning. Written by the `improve` skill and auto-loaded back into
future sessions by `.claude/hooks/improve-session-start.sh`.

- [[2026-08-11-tier-4-status-and-unverified-assertions]] — a protocol tier reported as not-yet-due three times without inspecting the repo, a branch cut from a stale ref that put pre-merge files in the working tree, a branch status revised three times before landing back on the first answer (a tip comparison shows that files differ, not which side is behind), and the two Tier 4 items that don't wait for a client vault (2026-08-11)
- [[2026-08-10-gate-discipline-and-plain-language]] — protocol shorthand used as if it were shared vocabulary, and the owner choosing the full review gate over a fast merge on a 32-line fix (2026-08-10)
- [[2026-08-10-audit-followup-and-session-record-ruling]] — the owner's ruling that notes are this vault's session record, a verification table that paraphrased its own output, and why the deferred fix went to its own PR rather than onto a branch whose audit record was already frozen (2026-08-10)
- [[2026-08-10-vibeos-audit-protocol-run]] — a test that could not fail and had already been cited as evidence three times, a review gate counted from resolved threads rather than clean passes, and why the audit pack is a committed file rather than a PR thread (2026-08-10)
- [[2026-08-10-ci-lint-globbing-and-review-thread-cleanup]] — a syntax gate that parsed only its first file, a lint step that went red where no scripts existed yet, and a durable note asserting the inverse of the delivery order CI was built to survive (2026-08-10)
- [[2026-08-10-vault-path-guards-and-improve-rules-pointer]] — four ways work looked finished and wasn't: rules nothing referenced, then rules a sync couldn't deliver, a loader reading its own README as a note, and a fence bypassable by filename; plus guards matching spelling rather than how paths resolve (2026-08-10)
