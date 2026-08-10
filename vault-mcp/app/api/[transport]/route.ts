import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import nodePath from "node:path";
import { timingSafeEqualStrings, verifySignedToken } from "../../../lib/oauth";

// This vault's GitHub repo. Required — the server refuses to run without
// them rather than defaulting to someone else's repo.
const OWNER = process.env.VAULT_OWNER || "";
const REPO = process.env.VAULT_REPO || "";
const BRANCH = process.env.VAULT_BRANCH || "main";
const GITHUB_TOKEN = process.env.VAULT_GITHUB_TOKEN;
const MCP_TOKEN = process.env.VAULT_MCP_TOKEN;

function vaultConfigured(): boolean {
  return Boolean(OWNER && REPO && GITHUB_TOKEN);
}

// Notes-only write guard. The connector must never write to its own
// deployment footprint — server code, CI, or deploy config. A note never
// lives there, and allowing it would let an injected or mistaken tool call
// rewrite the running server and trigger a redeploy, far beyond the
// "one notes repo" blast radius. This also covers paths that get executed
// or loaded locally rather than by this server: `.claude/` holds hooks
// Claude Code auto-runs on session start/stop, and `.obsidian/plugins/`
// holds JS Obsidian loads on open — a write to either turns ordinary note
// access into local code execution the next time the vault is opened.
//
// These are mandatory, not configurable defaults — there's no legitimate
// layout where an AI connector should be able to write executable code
// paths, so VAULT_PROTECTED_PREFIXES only ever *adds* extra prefixes on
// top of this list, never removes from it. (An earlier version let the
// env var fully replace the list, which meant any custom override
// silently reopened these exact paths.)
const MANDATORY_PROTECTED_PREFIXES = [
  ".github/",
  ".vercel/",
  "vault-mcp/",
  "tools/",
  ".claude/",
  ".obsidian/plugins/",
  // Editor-managed folders that run commands on open or on container
  // build. They aren't server code, but they're the same class of thing
  // as .claude/: files a human never re-reads that something executes.
  ".vscode/",
  ".devcontainer/",
];

// Files that are loaded *as instructions* by an agent reading this vault,
// wherever in the tree they sit — checked by basename, not just at the
// root, because Claude Code picks up memory files from subdirectories
// too, so blocking only "CLAUDE.md" would leave "notes/CLAUDE.md" open.
//
// This closes the gap that made the untrusted-note fence in
// .claude/hooks/improve-session-start.sh bypassable by filename. Fencing
// note bodies is worth doing, but the same write privilege that reaches
// ai-improvements/*.md also reached CLAUDE.md, which is injected into
// every session verbatim, unfenced, and with no untrusted-content
// warning — so an attacker could simply pick the file that isn't fenced.
// .mcp.json is worse in kind than the memory files: it declares MCP
// servers by command and args, i.e. local process launch.
//
// SECURITY.md §2 sends the owner's standing instructions to CLAUDE.md
// precisely because it's the human-authored, diff-reviewable channel.
// That's only true if this connector cannot write it.
// Each entry is a *supported spelling* of one of these files, not a
// variant of one name — Claude Code loads CLAUDE.local.md as project-local
// instructions in its own right, and a dev container is configured by
// either .devcontainer/devcontainer.json (covered by the prefix above) or
// a root .devcontainer.json, which the prefix does not cover. Both carry
// the same consequence as the name beside them: instructions loaded
// verbatim, and lifecycle commands (initializeCommand, postCreateCommand)
// run on container build. Missing a spelling reopens the whole path, so
// these track what the tools actually accept rather than what looks
// canonical.
const PROTECTED_BASENAMES = new Set([
  "claude.md",
  "claude.local.md",
  "agents.md",
  ".mcp.json",
  ".devcontainer.json",
]);
const EXTRA_PROTECTED_PREFIXES = process.env.VAULT_PROTECTED_PREFIXES
  ? process.env.VAULT_PROTECTED_PREFIXES.split(",")
  : [];
const PROTECTED_PREFIXES = [...MANDATORY_PROTECTED_PREFIXES, ...EXTRA_PROTECTED_PREFIXES]
  .map((s) => s.trim())
  .filter(Boolean);
const PROTECTED_ROOT_FILES = new Set([
  "vercel.json",
  "package.json",
  "package-lock.json",
  "next.config.mjs",
  "next.config.js",
  // Next.js accepts a TypeScript config too, and it's server code like the
  // other two — leaving it off the list made this set quietly narrower than
  // "the deploy config", which is what everything referring to it assumes.
  "next.config.ts",
  "tsconfig.json",
  ".gitignore",
]);

// The one path boundary, shared by read_file, list_files AND write_file.
//
// It used to be write-only, and that asymmetry was the bug: read_file and
// list_files handed raw input straight to the URL builder, and since
// encodeURIComponent leaves "." alone, the WHATWG URL parser inside fetch
// resolved the ".." segments itself and walked the request out of this
// repo's contents/ endpoint onto arbitrary api.github.com endpoints —
// ".../contents/../../../../user" resolves to "api.github.com/user" —
// each one still carrying VAULT_GITHUB_TOKEN. A single-repo fine-grained
// token capped the damage, but the "this connector only manages notes"
// boundary the write side enforces simply wasn't there on the read side.
// A guard on one verb is not a boundary, so all three resolve here now
// and write_file layers its protected-prefix checks on top.
//
// Returns the resolved path to *use*, not just a verdict: the caller must
// build its GitHub URL from this value, or a path that passed the checks
// in one form can still be sent to GitHub in another.
// Discriminated on `ok` rather than on the presence of `error`: an error
// string is allowed to be empty as far as the type system is concerned, so
// `if (result.error)` narrows nothing under `strict` and a caller could
// reach for `.path` on a rejected path without the compiler objecting.
type ResolvedPath = { ok: true; path: string } | { ok: false; error: string };

function resolveVaultPath(rawPath: string, { allowRoot = false } = {}): ResolvedPath {
  const posixInput = String(rawPath ?? "").replace(/\\/g, "/");
  // nodePath.posix.normalize collapses *every* "." segment and resolves
  // ".." against a preceding real segment, unlike a single-pass regex
  // strip — a crafted path like "././.claude/x" left a leading "./"
  // behind after only one strip, which doesn't match the ".claude/"
  // prefix check below even though GitHub's own path resolution collapses
  // it right back to the real protected file, bypassing the guard
  // entirely.
  let norm = nodePath.posix.normalize(posixInput);
  // normalize() preserves a trailing slash, and collapses "a/../" to "./"
  // rather than "." — so strip trailing slashes before the root/emptiness
  // checks below, or "./" and "notes/../" slip through as *non-empty*
  // paths that GitHub then resolves back to the repo root anyway. Guarded
  // on length so a bare "/" stays absolute and is refused as such rather
  // than becoming "".
  if (norm.length > 1) norm = norm.replace(/\/+$/, "");
  if (norm === ".") norm = "";
  // An absolute path is refused rather than quietly rewritten. The old
  // write guard stripped the leading slash before its checks, so "/x" was
  // *checked* as "x" but then sent to GitHub as "contents//x" — a
  // different path, which 404s and reads back to the owner as a missing
  // note. Saying "give me a relative path" is the honest answer, and it
  // keeps the checked string and the fetched string identical.
  // (normalize() has already resolved any ".." against the root here, so
  // an absolute path can no longer escape by that route either.)
  if (norm.startsWith("/")) {
    return { ok: false, error: "path must be relative to the vault root, with no leading '/'" };
  }
  if (norm === ".." || norm.startsWith("../")) return { ok: false, error: "path traversal is not allowed" };
  // Only list_files may ask for the vault root ("" or "."); a read or a
  // write with no path is a mistake worth naming rather than a request
  // for the repository root.
  if (!norm) return allowRoot ? { ok: true, path: "" } : { ok: false, error: "path is empty" };
  return { ok: true, path: norm };
}

// Write-only checks, layered on top of resolveVaultPath — notes may live
// anywhere in the vault, but never in the deployment's own footprint.
// Takes an already-resolved path, so it can never be handed a "."- or
// ".."-laden variant of a protected path.
// Build the string the protection checks compare against — never the
// string written. Two filesystem quirks can make a name that doesn't look
// protected resolve to a protected file once the repo is checked out, and
// both have to be folded away here or the guard is bypassable by spelling:
//
//   - Case. GitHub's repo storage is case-sensitive, but a checkout onto a
//     case-insensitive filesystem (macOS/Windows default) aliases
//     ".CLAUDE/..." onto the real ".claude/..." on disk.
//   - Trailing dots and spaces. The Win32 path layer silently strips them,
//     so ".claude./hooks/x" and ".claude /hooks/x" both open the real
//     ".claude/hooks/x" on Windows. GitHub stores the literal name, so this
//     only bites on the checkout — which is exactly where the auto-run
//     hooks and Obsidian plugins live, so that's the side that matters.
function protectionKey(p: string): string {
  return p
    .split("/")
    .map((seg) => seg.replace(/[. ]+$/, ""))
    .join("/")
    .toLowerCase();
}

function protectedWriteReason(norm: string): string | null {
  const normLower = protectionKey(norm);
  if (PROTECTED_ROOT_FILES.has(normLower)) return `'${norm}' is a protected config file`;
  // Basename check, so a memory file is caught at any depth. protectionKey
  // has already folded case and trailing dots/spaces, so the segment it
  // yields is the one the filesystem will actually open.
  const base = normLower.slice(normLower.lastIndexOf("/") + 1);
  if (PROTECTED_BASENAMES.has(base)) {
    return `'${norm}' is loaded as instructions by agents reading this vault; this connector only manages notes`;
  }
  for (const pre of PROTECTED_PREFIXES) {
    const p = (pre.endsWith("/") ? pre : pre + "/").toLowerCase();
    if (normLower === p.slice(0, -1) || normLower.startsWith(p)) {
      return `'${pre}' is protected (server code, CI/deploy config, or an auto-run script/plugin path); this connector only manages notes`;
    }
  }
  return null;
}

// Encode each path segment so reserved characters (# ? spaces, etc.) in
// note names survive — encodeURI would leave # and ? unescaped and read or
// write the wrong file.
function encodePath(p: string): string {
  return p
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function ghHeaders() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// A credentials problem must never be reported as missing notes.
//
// GitHub deliberately answers 404 — not 403 — for a private repo a token
// can't see, so it never leaks whether that repo exists. That means an
// expired, revoked, or wrong-account token makes *every* path return 404,
// and a naive "404 means not found" reads back to the owner as "your notes
// are gone." They aren't: the notes sit untouched in GitHub and the
// connector simply can't authenticate. Telling someone their second brain
// is empty when it isn't is the worst failure this server can produce, so
// on a 404 we ask one more question — can we see the repo at all? — before
// deciding which story to tell.
type VaultAuthProblem = { message: string };

// The honest form of reassurance. A failed request is evidence about the
// request, never about the vault's contents — an expired token or an outage
// can perfectly well coexist with a repo someone deleted an hour ago. So we
// say the failure isn't evidence of loss, which is provable, instead of
// asserting the notes are safe, which isn't. Both halves of this file's
// history got that wrong in opposite directions: first "your notes are gone"
// when they weren't, then "your notes are safe" when we couldn't know. A
// wrong reassurance is the more expensive error, because it steers someone
// away from a recovery that still had time on the clock.
const NOT_EVIDENCE =
  "This is a connection or credentials failure — it says nothing either way about what's in your vault, so don't read it as data loss.";

// For failures that are definitely NOT credentials-related (a repository rule
// refused the write, say). Appending the credentials wording there would
// contradict the diagnosis in the same breath and push the owner back toward
// rotating a token that was never the problem.
const NOT_DATA_LOSS =
  "This says nothing about what's in your vault either way, so don't read it as data loss.";

const TOKEN_FIX =
  `Check VAULT_GITHUB_TOKEN in your Vercel project's environment settings: it may have expired, been revoked, ` +
  `or been created under a different GitHub account than the one that owns ${OWNER}/${REPO}. ` +
  `Also confirm the token's repository access still lists ${OWNER}/${REPO}. ` +
  `Generate a fresh token, update it in Vercel, redeploy, then reconnect.`;

const RATE_LIMITED = `Vault temporarily unreachable: GitHub is rate-limiting requests right now. This is throttling, not a credentials problem, so don't rotate anything — and it says nothing about your notes. Wait a few minutes and try again.`;

// GitHub's primary rate limit can reset up to an hour out, so "a few minutes"
// is advice that has an owner retrying a connector that cannot succeed yet.
// When the reset header is present, say when; secondary limits often omit it,
// hence the generic fallback.
function rateLimitedMessage(res: Response): string {
  // Retry-After is the authoritative delay for a *secondary* limit, and it can
  // coexist with an unrelated primary-bucket reset. Prefer it; the primary
  // reset only describes when the hourly quota refills.
  const retryAfter = Number(res.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    const mins = Math.ceil(retryAfter / 60);
    const wait = retryAfter < 60 ? `${Math.ceil(retryAfter)} seconds` : `${mins} minute${mins === 1 ? "" : "s"}`;
    return (
      `Vault temporarily unreachable: GitHub is rate-limiting requests right now. This is throttling, not a credentials problem, so don't rotate anything — and it says nothing about your notes. ` +
      `GitHub asked to be retried in about ${wait}; retrying sooner will keep failing.`
    );
  }
  // x-ratelimit-reset describes the *primary* hourly bucket. On a secondary
  // limit that bucket is often untouched, so quoting its reset would tell an
  // owner to wait up to an hour for a throttle that clears in seconds. Only
  // trust it when the primary quota is actually exhausted.
  if (res.headers.get("x-ratelimit-remaining") !== "0") return RATE_LIMITED;
  const reset = Number(res.headers.get("x-ratelimit-reset"));
  if (!Number.isFinite(reset) || reset <= 0) return RATE_LIMITED;
  const resetMs = reset * 1000;
  const minutes = Math.ceil((resetMs - Date.now()) / 60000);
  if (minutes < 1) return RATE_LIMITED;
  const when = new Date(resetMs).toISOString().slice(11, 16);
  return (
    `Vault temporarily unreachable: GitHub is rate-limiting requests right now. This is throttling, not a credentials problem, so don't rotate anything — and it says nothing about your notes. ` +
    `The limit resets in about ${minutes} minute${minutes === 1 ? "" : "s"} (${when} UTC); retrying before then will keep failing.`
  );
}

// GitHub signals throttling as 429, or as 403 with a rate-limit body/header.
// Both are transient; describing either as a credentials failure would send
// the owner off rotating a perfectly good token.
async function isRateLimited(res: Response, knownBody?: string): Promise<boolean> {
  if (res.status === 429) return true;
  if (res.status !== 403) return false;
  if (res.headers.get("x-ratelimit-remaining") === "0") return true;
  if (res.headers.get("retry-after")) return true;
  // Callers that already consumed the body must pass it: res.clone() throws
  // synchronously once the body is read, and that throw is not catchable by
  // the .catch() on .text() — it would surface as a generic error instead of
  // the rate-limit guidance.
  if (typeof knownBody === "string") return /rate limit|secondary rate/i.test(knownBody);
  const body = await res.clone().text().catch(() => "");
  return /rate limit|secondary rate/i.test(body);
}

// GitHub explains protected-branch and ruleset rejections in the body, and
// sends them under several statuses (403, but also 409 and 422), so the shape
// of the message is the reliable signal rather than the status code.
function looksLikeRuleRejection(reason: string): boolean {
  // Deliberately narrow. "not allowed to push" on its own is what a
  // read-only collaborator gets, and calling that a branch rule would send
  // the owner to Settings → Branches to loosen a rule that isn't the
  // problem, while telling them their token permissions are fine when those
  // are exactly what's wrong. Require language that only branch protection
  // or a ruleset produces.
  return /protected branch|branch protection|ruleset|rule violation|required status check|review required|changes must be made through a pull request/i.test(
    reason
  );
}

// Decides which story a failure really tells. `originalStatus` is the status
// of the call that actually failed — it matters, because a token can be
// allowed to see a repo's metadata while being refused its *contents*, and
// then a successful metadata probe would otherwise "clear" a real permissions
// problem.
async function diagnoseVaultFailure(
  originalStatus: number,
  operation: "read" | "write" = "read",
  githubReason?: string
): Promise<VaultAuthProblem | null> {
  // A rule-shaped rejection is already definitive — GitHub named the cause —
  // so decide it before touching the network. The probe below can itself fail
  // or be rate-limited (a rejected write may have consumed the last request in
  // the window), and an early return there would throw away the one
  // explanation that was certain.
  const preReason = (githubReason || "").trim();
  if (operation === "write" && looksLikeRuleRejection(preReason)) {
    return {
      message:
        `Write refused by a repository rule, not by the token: GitHub said "${preReason.slice(0, 400)}". ` +
        `Changing the token's permissions won't help — go to the rule GitHub named, at GitHub → the repo → Settings → Rules (and Settings → Branches for classic protection). ` +
        `If that rule targets the "${BRANCH}" branch specifically, relaxing it or pointing VAULT_BRANCH at an uncovered branch both work. ` +
        `If it's a repository-wide push rule — restricted file paths, extensions, file size, commit metadata — switching branches will not help and the rule itself has to change. ` +
        `${NOT_DATA_LOSS}`,
    };
  }

  // A 401 on the original request is GitHub's final word: it rejected the
  // credentials outright. The probe below can still add detail, but it can
  // also fail transiently or get throttled — and if an inconclusive probe
  // were allowed to speak last, the owner would be told to retry a request
  // that will never succeed until the token is fixed. So keep the 401 as the
  // fallback whenever the probe can't settle anything.
  const definitive401 = originalStatus === 401 ? {
    message:
      `Vault unreachable: GitHub rejected the access token (401) on the original request. ` +
      `That answer is definitive — the token is expired, revoked, or malformed, and retrying won't change it. ` +
      `${NOT_EVIDENCE} ${TOKEN_FIX}`,
  } : null;

  let repoRes: Response;
  try {
    repoRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}`, { headers: ghHeaders() });
  } catch {
    return (
      definitive401 ?? {
        message: `Couldn't reach GitHub at all (network error). ${NOT_EVIDENCE} Try again in a moment.`,
      }
    );
  }

  if (!repoRes.ok) {
    if (await isRateLimited(repoRes)) return definitive401 ?? { message: rateLimitedMessage(repoRes) };
    if (repoRes.status === 401) {
      return { message: `Vault unreachable: GitHub rejected the access token (401). ${NOT_EVIDENCE} ${TOKEN_FIX}` };
    }
    if (repoRes.status === 403) {
      // A repo-level 403 is often an org policy — SAML SSO not authorized for
      // this token, an IP allow list, or a pending token-approval request.
      // Regenerating a token fixes none of those, so GitHub's own explanation
      // is the actionable part and must not be replaced by a guess.
      const reason = (await repoRes.text().catch(() => "")).trim();
      let detail = reason;
      try {
        const parsed = JSON.parse(reason) as { message?: string };
        if (parsed?.message) detail = parsed.message;
      } catch {
        // Not JSON — keep the raw text.
      }
      if (detail) {
        return {
          message:
            `Vault unreachable: GitHub refused the access token for ${OWNER}/${REPO} (403). GitHub's reason: "${detail.slice(0, 400)}". ` +
            `${NOT_EVIDENCE} If that mentions SSO, SAML, an IP allow list, or organization approval, a new token won't help — follow what GitHub says there first (commonly: authorize the token for the organization's SSO). ` +
            `Otherwise: ${TOKEN_FIX}`,
        };
      }
      return { message: `Vault unreachable: GitHub refused the access token (403). ${NOT_EVIDENCE} ${TOKEN_FIX}` };
    }
    if (repoRes.status === 404) {
      // GitHub answers 404 both for "private repo this token may not see" and
      // for "no such repo", and there is no way to tell them apart from here.
      // So don't promise the notes are fine — give the one check that settles
      // it, cheapest first, and keep the real-deletion path visible.
      return {
        message:
          `Vault unreachable: GitHub returns "not found" for ${OWNER}/${REPO}. That has three possible causes and this server can't tell them apart, because GitHub deliberately answers "not found" for private repos a token isn't allowed to see:\n` +
          `1. The token can't see the repo — most common. ${TOKEN_FIX}\n` +
          `2. VAULT_OWNER or VAULT_REPO is misspelled in your Vercel environment settings. Compare them against the repo's real address.\n` +
          `3. The repository was renamed or deleted.\n\n` +
          `To find out which: open https://github.com/${OWNER}/${REPO} in a browser while signed in as the account that owns the vault. If the repo loads, it exists and is reachable by you, so this is cause 1 or 2 — check the notes are where you expect while you are there. If GitHub 404s there too, the repo is not at that address — check your GitHub account for a rename, and if it was deleted, recover it from Settings → Repositories → restore (GitHub keeps deleted repos ~90 days) or from your backups (BACKUP.md).`,
      };
    }
    return {
      message: `Vault unreachable: GitHub returned ${repoRes.status} for ${OWNER}/${REPO}. This is a connection or credentials problem rather than a report about your notes. Try again shortly; if it persists, check VAULT_GITHUB_TOKEN in Vercel.`,
    };
  }

  // The repo is visible, which proves the repo exists and this token can see
  // it. It proves nothing about the branch or the notes — both are checked
  // separately below, and neither is ever assumed.
  let repoInfo: { archived?: boolean } = {};
  try {
    repoInfo = (await repoRes.json()) as { archived?: boolean };
  } catch {
    // Non-fatal: we just lose the archived hint below.
  }

  const reason = preReason;

  // Visible metadata is NOT proof the token may read or write file contents:
  // a fine-grained token can carry Metadata access while missing Contents.
  if (originalStatus === 401 || originalStatus === 403) {
    // An archived repo is read-only for everyone, so writes 403 even with a
    // perfect read/write token. Prescribing a permission change there sends
    // the owner to fix something that isn't broken. Only for writes, though:
    // archived repos still read fine, so a failed *read* on one is a
    // permission problem and unarchiving would change repo state for nothing.
    if (repoInfo.archived && operation === "write") {
      return {
        message:
          `Write refused: ${OWNER}/${REPO} is archived, and GitHub makes archived repositories read-only — no token can commit to one. ` +
          `Archiving blocks writes only — reading is unaffected, though nothing here checked what the repo currently contains. To start saving again, open the repo on GitHub → Settings → scroll to the Danger Zone → "Unarchive this repository".`,
      };
    }
    // GitHub explains a protected-branch or ruleset rejection in the response
    // body, and that explanation is the actionable one — changing an already
    // correct Contents permission cannot make a write to a protected branch
    // succeed. So carry GitHub's own reason through rather than overwriting
    // it with a guess.
    // Prescribe the access the failed operation actually needs, no more. A
    // read only ever needs Contents: Read-only and the collaborator Read
    // role; telling someone whose *read* failed to grant themselves Write
    // can't fix it and hands out more access than the job requires.
    const fix =
      operation === "write"
        ? `Two things have to be true, and this server can't tell which one is missing. First, the token itself: GitHub → Settings → Developer settings → Fine-grained tokens, open this token and set Repository permissions → Contents to "Read and write" for ${OWNER}/${REPO}, then redeploy in Vercel if you regenerated it. ` +
          `Second, the account that owns the token: a token can never grant more access than its owner has, so if that account is a collaborator with the Read role, no token setting will let it write — check the repo's Settings → Collaborators and give it Write.`
        : `Reading needs Contents access, and a fine-grained token doesn't get it automatically — Metadata alone is what lets the repo show up at all. Go to GitHub → Settings → Developer settings → Fine-grained tokens, open this token and set Repository permissions → Contents to at least "Read-only" for ${OWNER}/${REPO} ("Read and write" if you also want saving to work), then redeploy in Vercel if you regenerated it. ` +
          `If that's already set, check the account that owns the token still has access to the repo at all — Settings → Collaborators. The Read role is enough for this; don't grant Write to fix a read.`;
    return {
      message:
        `Vault unreachable: the token can see ${OWNER}/${REPO} but GitHub refused to ${
          operation === "write" ? "write" : "read"
        } its files (${originalStatus}). ` +
        `${NOT_EVIDENCE} This looks like a token *permission* problem. ${fix}` +
        (reason ? ` GitHub's own explanation was: "${reason.slice(0, 400)}" — if that points somewhere else, believe it over this guess.` : ""),
    };
  }

  // A 404 on a path with a visible repo can still mean the *branch* is gone:
  // GitHub 404s the contents endpoint for a branch that doesn't exist, which
  // would otherwise be reported as "every note is missing" — the exact
  // false-data-loss story this whole function exists to prevent.
  let branchRes: Response;
  try {
    branchRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/branches/${encodeURIComponent(BRANCH)}`,
      { headers: ghHeaders() }
    );
  } catch {
    // Inconclusive — and inconclusive must never be reported as "this note
    // doesn't exist", which is exactly how a transient blip would otherwise
    // reproduce the false-data-loss bug.
    return {
      message: `Couldn't confirm the vault's state: the repository ${OWNER}/${REPO} is reachable, but checking the "${BRANCH}" branch failed with a network error. This is not a report that anything is missing — try again in a moment.`,
    };
  }
  if (await isRateLimited(branchRes)) return { message: rateLimitedMessage(branchRes) };
  if (branchRes.status === 404) {
    // A repository created without an initial commit has no branches at all,
    // so contents and branch both 404 for a completely benign reason. Saying
    // "fix your token" or "recover the deleted branch" there sends someone
    // chasing a problem that doesn't exist — the vault just hasn't started.
    let listChecked = false;
    let listInconclusive = false;
    try {
      const listRes = await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/branches?per_page=1`,
        { headers: ghHeaders() }
      );
      // A throttled probe is not evidence about branches. Without this, a
      // 429 (or a rate-limited 403) just leaves listRes.ok false and falls
      // through to the ambiguous diagnosis below — handing the owner a
      // token/branch-name/deletion/empty-repo menu for what is really a
      // wait-and-retry. Every other probe here checks this; this one didn't.
      if (await isRateLimited(listRes)) return { message: rateLimitedMessage(listRes) };
      if (listRes.ok) {
        const branches = (await listRes.json()) as unknown[];
        listChecked = Array.isArray(branches);
        // A nonempty list is proof of Contents (read) access — the same
        // permission /branches/{branch} needs. So the earlier 404 wasn't
        // GitHub hiding a private resource; that branch really is absent, and
        // offering "fix your token" would send the owner to change a setting
        // this very response just demonstrated is fine.
        //
        // Only for reads, though. This probe is a GET, so it clears read
        // access and nothing else — telling someone mid-save that "your
        // permissions are not the problem" would be the same over-claim
        // the empty-repo case had to fix.
        if (Array.isArray(branches) && branches.length > 0) {
          return {
            message:
              `Vault unreachable: ${OWNER}/${REPO} has branches, but "${BRANCH}" is not one of them. This token can read the branch list, so ${
                operation === "write" ? "it can at least reach the repo" : "its permissions are not the problem"
              } — the configured branch simply isn't there. Two ways that happens:\n` +
              `1. VAULT_BRANCH points at a name that never existed — check it in your Vercel environment settings (leave it unset to use "main"), then redeploy.\n` +
              `2. The branch was deleted. Its commits usually still exist: on GitHub open the repo → Insights → Network, or restore from a recent backup (BACKUP.md), and recreate the branch before pointing the connector back at it.\n\n` +
              `The repo's branch list on GitHub tells you which name to use. Check Insights → Network for commits under "${BRANCH}" before repointing, so you don't walk away from history that's still recoverable.` +
              (operation === "write"
                ? ` One caveat for saving: every check here was a read, so none of it confirms the connector can write. If saving still fails once the branch is back, the token needs Contents: "Read and write" and the account behind it needs Write access to the repo.`
                : "") +
              ` ${NOT_DATA_LOSS}`,
          };
        }
        if (Array.isArray(branches) && branches.length === 0) {
          // An empty repo is a dead end for a read, but not for a write:
          // GitHub's contents API creates the first file, first commit, and
          // the branch in one PUT. Refusing here would have this server
          // decline the very thing write_file exists to do, and send the
          // owner off to hand-make a README first. Return "no vault problem"
          // so the caller's preflight yields null and the write goes ahead —
          // if it's really a permissions failure, the PUT says so with
          // evidence instead of this GET-only guess.
          if (operation === "write") return null;
          return {
            message:
              `The vault repository ${OWNER}/${REPO} exists but is empty — it has no commits yet, so there is no "${BRANCH}" branch and nothing to read. This is a fresh-vault state, not a fault. ` +
              `Give it a first commit: on GitHub open the repo and use "creating a new file" (a README is fine) with "${BRANCH}" as the branch, or push an existing vault to it. Then try again. Saving a note through this connector will also create that first commit, provided its token has write access — which nothing here checked, since this was a read.`,
          };
        }
      }
    } catch {
      // Couldn't list branches — fall through, but the ambiguous diagnosis
      // below must keep the empty-repo possibility, or a transient failure of
      // this probe restores the exact first-run misdiagnosis it was added to
      // prevent.
      listInconclusive = true;
    }
    if (!listChecked) listInconclusive = true;
    return {
      message:
        `Vault unreachable: GitHub returns "not found" for the branch "${BRANCH}" of ${OWNER}/${REPO}. Seeing the repo doesn't prove this token may read its branches — a fine-grained token gets Metadata access automatically but needs Contents access for this — so several things could be true:\n` +
        `1. The token lacks Contents access, and GitHub is hiding the branch behind the same "not found" it uses for private resources. In GitHub → Settings → Developer settings → Fine-grained tokens, set Repository permissions → Contents to "Read and write" for ${OWNER}/${REPO}.\n` +
        `2. VAULT_BRANCH points at a name that doesn't exist — check it in your Vercel environment settings (leave it unset to use "main"), then redeploy.\n` +
        `3. That branch was deleted. The commits usually still exist: on GitHub open the repo → Insights → Network, or restore from a recent backup (BACKUP.md). Recreate the branch before pointing the connector back at it.\n` +
        (listInconclusive
          ? `4. The repository is brand new and has no commits at all, so it has no branches yet — this check couldn't be completed, so that possibility stays open. If the repo is empty, just make a first commit on "${BRANCH}".\n`
          : "") +
        `\n` +
        `Open the repo's branch list on GitHub in a browser, signed in as the owner. If "${BRANCH}" is listed, the branch exists and this connector simply cannot see it — case 1, a permission problem. (That says nothing about any particular note; it only rules out a missing branch.) If "${BRANCH}" is absent — or the list is empty, which means the repo has no commits yet — the list alone cannot tell the remaining cases apart: a name that was never right and a branch someone deleted look identical from outside. Before repointing VAULT_BRANCH at another branch, check the repo → Insights → Network for commits on a branch by that name, so you do not walk away from history that is still recoverable.`,
    };
  }
  if (!branchRes.ok) {
    return {
      message: `Couldn't confirm the vault's state: checking the "${BRANCH}" branch of ${OWNER}/${REPO} returned ${branchRes.status}. This is not a report that anything is missing — try again shortly.`,
    };
  }

  return null; // repo and branch both confirmed present — the path genuinely doesn't exist
}

// Thrown when the vault itself can't be reached, so every tool reports the
// credentials story rather than an empty or "not found" result.
class VaultUnreachable extends Error {}

// `operation` is what the caller is ultimately trying to do, not what this
// function does — every probe in here is a GET regardless. write_file calls
// this as a preflight, and without the intent flowing through, a read-only
// token against an empty repo is told "fresh-vault state, not a fault, just
// make a first commit" — and saving still fails afterwards, because nothing
// checked write access. The diagnosis has a caveat for exactly that case;
// it was simply unreachable from the one path that needs it.
async function ghGetPath(path: string, operation: "read" | "write" = "read") {
  // Re-resolve at the chokepoint instead of trusting the caller. Every tool
  // resolves before it gets here and reports a friendlier message, so this
  // should be unreachable — it exists so a *future* caller that forwards raw
  // input can't quietly reintroduce the traversal in the one function that
  // builds the GitHub URL. allowRoot, because a bare contents/ listing is the
  // legitimate vault-root read.
  const resolved = resolveVaultPath(path, { allowRoot: true });
  if (!resolved.ok) throw new Error(`Refusing to request '${path}': ${resolved.error}`);
  const cleanPath = resolved.path;
  // encodeURIComponent on the ref, not raw interpolation: a branch name may
  // legally contain "&" or "#", which would otherwise truncate the query and
  // silently fetch a *different* ref — and then a successful branch probe
  // below would "confirm" the note is absent when we never asked for the
  // right branch at all.
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodePath(cleanPath)}?ref=${encodeURIComponent(BRANCH)}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 404) {
    const problem = await diagnoseVaultFailure(404, operation);
    if (problem) throw new VaultUnreachable(problem.message);
    return null; // repo and branch both fine, so this path genuinely doesn't exist
  }
  if (res.status === 401 || res.status === 403 || res.status === 429) {
    if (await isRateLimited(res)) throw new VaultUnreachable(rateLimitedMessage(res));
    const problem = await diagnoseVaultFailure(res.status, operation);
    throw new VaultUnreachable(
      problem?.message ??
        `Vault unreachable: GitHub refused the request (${res.status}). ${NOT_EVIDENCE}`
    );
  }
  if (!res.ok) {
    throw new Error(`GitHub GET ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

// Every tool body runs inside this, so no failure reaches the owner as an
// unhandled throw — and never as a silent empty result.
async function guard(run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run();
  } catch (err) {
    const text =
      err instanceof VaultUnreachable
        ? err.message
        : `Vault error: ${err instanceof Error ? err.message : String(err)}`;
    return { content: [{ type: "text" as const, text }], isError: true };
  }
}

function notConfigured() {
  return {
    content: [
      {
        type: "text" as const,
        text: "Vault not configured: set VAULT_OWNER, VAULT_REPO, and VAULT_GITHUB_TOKEN in the deployment's environment.",
      },
    ],
    isError: true,
  };
}

const rawHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      "read_file",
      {
        title: "Read vault file",
        description:
          "Read a note's contents from your vault by repo-relative path (e.g. '00_moc/AI Improvements Index.md').",
        inputSchema: { path: z.string() },
      },
      async ({ path }) =>
        guard(async () => {
          if (!vaultConfigured()) return notConfigured();
          const resolved = resolveVaultPath(path);
          if (!resolved.ok) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Can't read '${path}': ${resolved.error}. Paths are relative to the vault root, e.g. '00_moc/AI Improvements Index.md'.`,
                },
              ],
              isError: true,
            };
          }
          const file = await ghGetPath(resolved.path);
          if (!file || Array.isArray(file)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: Array.isArray(file)
                    ? `'${path}' is a folder, not a note. Use list_files to see what's inside it.`
                    : `No note at '${path}'. The vault is reachable — this path just doesn't exist in it. Use list_files to see what's there.`,
                },
              ],
              isError: true,
            };
          }
          const text = Buffer.from(file.content, "base64").toString("utf-8");
          return { content: [{ type: "text" as const, text }] };
        })
    );

    server.registerTool(
      "write_file",
      {
        title: "Write vault file",
        description:
          "Create or update a note in your vault and commit it directly to the vault's branch (no PR — this is a personal notes vault). Notes only: writes to server code, CI, or deploy config are refused.",
        inputSchema: {
          path: z.string(),
          content: z.string(),
          message: z.string().describe("Commit message"),
        },
      },
      async ({ path, content, message }) =>
        guard(async () => {
          if (!vaultConfigured()) return notConfigured();
          const resolved = resolveVaultPath(path);
          if (!resolved.ok) {
            return {
              content: [{ type: "text" as const, text: `Refused to write ${path}: ${resolved.error}.` }],
              isError: true,
            };
          }
          const blocked = protectedWriteReason(resolved.path);
          if (blocked) {
            return {
              content: [{ type: "text" as const, text: `Refused to write ${path}: ${blocked}.` }],
              isError: true,
            };
          }
          const existing = await ghGetPath(resolved.path, "write");
          const body: Record<string, unknown> = {
            message,
            content: Buffer.from(content, "utf-8").toString("base64"),
            branch: BRANCH,
          };
          if (existing && !Array.isArray(existing)) body.sha = existing.sha;
          const res = await fetch(
            `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodePath(resolved.path)}`,
            { method: "PUT", headers: ghHeaders(), body: JSON.stringify(body) }
          );
          if (!res.ok) {
            // A write rejected for auth reasons must say so, not read as a
            // vague failure the owner can't act on. A read-only token is the
            // common case here: it can read every note and fails only on the
            // commit, so the message has to name the Contents permission —
            // unless GitHub's own body says a branch rule stopped it, in
            // which case that reason wins.
            const rawBody = await res.text().catch(() => "");
            let ghMessage = rawBody;
            try {
              const parsed = JSON.parse(rawBody) as { message?: string };
              if (parsed?.message) ghMessage = parsed.message;
            } catch {
              // Not JSON — keep the raw text.
            }
            // Body already consumed above, so hand it to isRateLimited rather
            // than letting it clone a spent response.
            if (await isRateLimited(res, rawBody)) {
              return { content: [{ type: "text" as const, text: rateLimitedMessage(res) }], isError: true };
            }
            // Branch-protection and ruleset rejections arrive as 409 or 422 as
            // well as 403, so classify on the body's shape rather than gating
            // this behind the auth-status list — otherwise a clearly
            // rule-shaped rejection falls through to a bare "Write failed".
            if (
              looksLikeRuleRejection(ghMessage) ||
              res.status === 401 ||
              res.status === 403 ||
              res.status === 404 ||
              res.status === 429
            ) {
              const problem = await diagnoseVaultFailure(res.status, "write", ghMessage);
              if (problem) {
                return { content: [{ type: "text" as const, text: problem.message }], isError: true };
              }
            }
            return {
              content: [{ type: "text" as const, text: `Write failed: ${res.status} ${ghMessage}` }],
              isError: true,
            };
          }
          // Report the path actually committed, not the raw request: if the
          // caller sent "notes/./x.md", "notes/x.md" is where the note is.
          return { content: [{ type: "text" as const, text: `Committed ${resolved.path} to ${BRANCH}` }] };
        })
    );

    server.registerTool(
      "list_files",
      {
        title: "List vault directory",
        description:
          "List files in a directory of your vault (non-recursive). Pass '' or '.' for the vault root.",
        inputSchema: { path: z.string().default("") },
      },
      async ({ path }) =>
        guard(async () => {
          if (!vaultConfigured()) return notConfigured();
          // allowRoot: '' and '.' are this tool's documented way to ask for
          // the vault root, and stay supported.
          const resolved = resolveVaultPath(path, { allowRoot: true });
          if (!resolved.ok) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Can't list '${path}': ${resolved.error}. Paths are relative to the vault root — pass '' or '.' for the root itself.`,
                },
              ],
              isError: true,
            };
          }
          const listing = await ghGetPath(resolved.path);
          if (!listing) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No folder at '${path}'. The vault is reachable — this path just doesn't exist in it.`,
                },
              ],
              isError: true,
            };
          }
          if (!Array.isArray(listing)) {
            return {
              content: [{ type: "text" as const, text: `'${path}' is a note, not a folder. Use read_file to open it.` }],
              isError: true,
            };
          }
          const names = listing
            .map((f: { type: string; path: string }) => `${f.type === "dir" ? "📁" : "📄"} ${f.path}`)
            .join("\n");
          // "(empty)" alone is the sentence an owner misreads as data loss.
          // Reaching here means the vault authenticated fine, so say so.
          return {
            content: [
              {
                type: "text" as const,
                text: names || `'${path || "the vault root"}' is reachable and contains no files yet (this is an empty folder, not a connection problem).`,
              },
            ],
          };
        })
    );
  },
  {},
  { basePath: "/api", maxDuration: 60 }
);

function isAuthorized(req: Request): boolean {
  // Unauthenticated mode only ever for local `next dev` — production
  // fails closed if VAULT_MCP_TOKEN is missing instead of falling open.
  if (!MCP_TOKEN) return process.env.NODE_ENV !== "production";

  const match = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const token = match[1];

  // Two valid credentials: the static owner token (used by Claude Code
  // CLI config), or an expiring signed token issued by /api/oauth/token
  // (used by claude.ai / ChatGPT connectors).
  if (timingSafeEqualStrings(token, MCP_TOKEN)) return true;
  const signed = verifySignedToken<{ sub?: string }>(token);
  return signed?.sub === "vault-owner";
}

async function handler(req: Request) {
  if (!isAuthorized(req)) {
    const origin = new URL(req.url).origin;
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      },
    });
  }
  return rawHandler(req);
}

export { handler as GET, handler as POST, handler as DELETE };
