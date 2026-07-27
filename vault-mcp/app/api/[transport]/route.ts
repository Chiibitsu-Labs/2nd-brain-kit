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
];
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
  "tsconfig.json",
  ".gitignore",
]);

function writeBlockReason(rawPath: string): string | null {
  const posixInput = rawPath.replace(/\\/g, "/");
  // nodePath.posix.normalize collapses *every* "." segment and resolves
  // ".." against a preceding real segment, unlike a single-pass regex
  // strip — a crafted path like "././.claude/x" left a leading "./"
  // behind after only one strip, which doesn't match the ".claude/"
  // prefix check below even though GitHub's own path resolution collapses
  // it right back to the real protected file, bypassing the guard
  // entirely.
  let norm = nodePath.posix.normalize(posixInput).replace(/^\/+/, "");
  if (norm === ".") norm = "";
  if (!norm) return "path is empty";
  if (norm === ".." || norm.startsWith("../")) return "path traversal is not allowed";
  // Case-fold only for the protection checks below, never for the actual
  // write (callers keep using the original-case `path`/`norm`-adjacent
  // value elsewhere). GitHub's own repo storage is case-sensitive, but a
  // checkout onto a case-insensitive filesystem (macOS/Windows default)
  // can alias ".CLAUDE/..." onto the real ".claude/..." on disk — a
  // case-sensitive comparison here could be bypassed by writing an
  // upper/mixed-case variant of a protected path that still lands on (or
  // collides with) the real file once a human checks the repo out.
  const normLower = norm.toLowerCase();
  if (PROTECTED_ROOT_FILES.has(normLower)) return `'${norm}' is a protected config file`;
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

const TOKEN_FIX =
  `Check VAULT_GITHUB_TOKEN in your Vercel project's environment settings: it may have expired, been revoked, ` +
  `or been created under a different GitHub account than the one that owns ${OWNER}/${REPO}. ` +
  `Also confirm the token's repository access still lists ${OWNER}/${REPO}. ` +
  `Generate a fresh token, update it in Vercel, redeploy, then reconnect.`;

const RATE_LIMITED = `Vault temporarily unreachable: GitHub is rate-limiting requests right now. This is throttling, not a credentials problem, so don't rotate anything — and it says nothing about your notes. Wait a few minutes and try again.`;

// GitHub signals throttling as 429, or as 403 with a rate-limit body/header.
// Both are transient; describing either as a credentials failure would send
// the owner off rotating a perfectly good token.
async function isRateLimited(res: Response): Promise<boolean> {
  if (res.status === 429) return true;
  if (res.status !== 403) return false;
  if (res.headers.get("x-ratelimit-remaining") === "0") return true;
  if (res.headers.get("retry-after")) return true;
  const body = await res.clone().text().catch(() => "");
  return /rate limit|secondary rate/i.test(body);
}

// Decides which story a failure really tells. `originalStatus` is the status
// of the call that actually failed — it matters, because a token can be
// allowed to see a repo's metadata while being refused its *contents*, and
// then a successful metadata probe would otherwise "clear" a real permissions
// problem.
async function diagnoseVaultFailure(
  originalStatus: number,
  operation: "read" | "write" = "read"
): Promise<VaultAuthProblem | null> {
  let repoRes: Response;
  try {
    repoRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}`, { headers: ghHeaders() });
  } catch {
    return {
      message: `Couldn't reach GitHub at all (network error). ${NOT_EVIDENCE} Try again in a moment.`,
    };
  }

  if (!repoRes.ok) {
    if (await isRateLimited(repoRes)) return { message: RATE_LIMITED };
    if (repoRes.status === 401) {
      return { message: `Vault unreachable: GitHub rejected the access token (401). ${NOT_EVIDENCE} ${TOKEN_FIX}` };
    }
    if (repoRes.status === 403) {
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
    return {
      message:
        `Vault unreachable: the token can see ${OWNER}/${REPO} but GitHub refused to read or write its files (${originalStatus}). ` +
        `${NOT_EVIDENCE} This looks like a token *permission* problem. ` +
        `In GitHub → Settings → Developer settings → Fine-grained tokens, open this token and set Repository permissions → Contents to "Read and write" for ${OWNER}/${REPO}. ` +
        `Save, then redeploy in Vercel if you regenerated the token.`,
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
  if (await isRateLimited(branchRes)) return { message: RATE_LIMITED };
  if (branchRes.status === 404) {
    return {
      message:
        `Vault unreachable: GitHub returns "not found" for the branch "${BRANCH}" of ${OWNER}/${REPO}. Seeing the repo doesn't prove this token may read its branches — a fine-grained token gets Metadata access automatically but needs Contents access for this — so there are three possibilities:\n` +
        `1. The token lacks Contents access, and GitHub is hiding the branch behind the same "not found" it uses for private resources. In GitHub → Settings → Developer settings → Fine-grained tokens, set Repository permissions → Contents to "Read and write" for ${OWNER}/${REPO}.\n` +
        `2. VAULT_BRANCH points at a name that doesn't exist — check it in your Vercel environment settings (leave it unset to use "main"), then redeploy.\n` +
        `3. That branch was deleted. The commits usually still exist: on GitHub open the repo → Insights → Network, or restore from a recent backup (BACKUP.md). Recreate the branch before pointing the connector back at it.\n\n` +
        `Open the repo's branch list on GitHub in a browser, signed in as the owner. If "${BRANCH}" is listed, you are in case 1 — a permission problem — and nothing is missing. If it is absent, you are in case 2 or 3, and the list alone cannot tell those apart: a name that was never right and a branch someone deleted look identical from outside. Before repointing VAULT_BRANCH at another branch, check the repo → Insights → Network for commits on a branch by that name, so you do not walk away from history that is still recoverable.`,
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

async function ghGetPath(path: string) {
  const cleanPath = path === "." ? "" : path;
  // encodeURIComponent on the ref, not raw interpolation: a branch name may
  // legally contain "&" or "#", which would otherwise truncate the query and
  // silently fetch a *different* ref — and then a successful branch probe
  // below would "confirm" the note is absent when we never asked for the
  // right branch at all.
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodePath(cleanPath)}?ref=${encodeURIComponent(BRANCH)}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 404) {
    const problem = await diagnoseVaultFailure(404);
    if (problem) throw new VaultUnreachable(problem.message);
    return null; // repo and branch both fine, so this path genuinely doesn't exist
  }
  if (res.status === 401 || res.status === 403 || res.status === 429) {
    if (await isRateLimited(res)) throw new VaultUnreachable(RATE_LIMITED);
    const problem = await diagnoseVaultFailure(res.status);
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
          const file = await ghGetPath(path);
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
          const blocked = writeBlockReason(path);
          if (blocked) {
            return {
              content: [{ type: "text" as const, text: `Refused to write ${path}: ${blocked}.` }],
              isError: true,
            };
          }
          const existing = await ghGetPath(path);
          const body: Record<string, unknown> = {
            message,
            content: Buffer.from(content, "utf-8").toString("base64"),
            branch: BRANCH,
          };
          if (existing && !Array.isArray(existing)) body.sha = existing.sha;
          const res = await fetch(
            `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodePath(path)}`,
            { method: "PUT", headers: ghHeaders(), body: JSON.stringify(body) }
          );
          if (!res.ok) {
            // A write rejected for auth reasons must say so, not read as a
            // vague failure the owner can't act on. A read-only token is the
            // common case here: it can read every note and fails only on the
            // commit, so the message has to name the Contents permission.
            if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 429) {
              if (await isRateLimited(res)) {
                return { content: [{ type: "text" as const, text: RATE_LIMITED }], isError: true };
              }
              const problem = await diagnoseVaultFailure(res.status, "write");
              if (problem) {
                return { content: [{ type: "text" as const, text: problem.message }], isError: true };
              }
            }
            return {
              content: [{ type: "text" as const, text: `Write failed: ${res.status} ${await res.text()}` }],
              isError: true,
            };
          }
          return { content: [{ type: "text" as const, text: `Committed ${path} to ${BRANCH}` }] };
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
          const listing = await ghGetPath(path);
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
