import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
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
// Override the defaults with a comma-separated VAULT_PROTECTED_PREFIXES if
// your layout differs.
const PROTECTED_PREFIXES = (process.env.VAULT_PROTECTED_PREFIXES
  ? process.env.VAULT_PROTECTED_PREFIXES.split(",")
  : [".github/", ".vercel/", "vault-mcp/", "tools/", ".claude/", ".obsidian/plugins/"]
)
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

function writeBlockReason(path: string): string | null {
  const norm = path.replace(/\\/g, "/").replace(/^\.?\/+/, "");
  if (!norm || norm === ".") return "path is empty";
  if (norm.split("/").some((seg) => seg === "..")) return "path traversal is not allowed";
  if (PROTECTED_ROOT_FILES.has(norm)) return `'${norm}' is a protected config file`;
  for (const pre of PROTECTED_PREFIXES) {
    const p = pre.endsWith("/") ? pre : pre + "/";
    if (norm === p.slice(0, -1) || norm.startsWith(p)) {
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

async function ghGetPath(path: string) {
  const cleanPath = path === "." ? "" : path;
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodePath(cleanPath)}?ref=${BRANCH}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub GET ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
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
      async ({ path }) => {
        if (!vaultConfigured()) return notConfigured();
        const file = await ghGetPath(path);
        if (!file || Array.isArray(file)) {
          return { content: [{ type: "text", text: `Not found: ${path}` }], isError: true };
        }
        const text = Buffer.from(file.content, "base64").toString("utf-8");
        return { content: [{ type: "text", text }] };
      }
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
      async ({ path, content, message }) => {
        if (!vaultConfigured()) return notConfigured();
        const blocked = writeBlockReason(path);
        if (blocked) {
          return { content: [{ type: "text", text: `Refused to write ${path}: ${blocked}.` }], isError: true };
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
          return {
            content: [{ type: "text", text: `Write failed: ${res.status} ${await res.text()}` }],
            isError: true,
          };
        }
        return { content: [{ type: "text", text: `Committed ${path} to ${BRANCH}` }] };
      }
    );

    server.registerTool(
      "list_files",
      {
        title: "List vault directory",
        description:
          "List files in a directory of your vault (non-recursive). Pass '' or '.' for the vault root.",
        inputSchema: { path: z.string().default("") },
      },
      async ({ path }) => {
        if (!vaultConfigured()) return notConfigured();
        const listing = await ghGetPath(path);
        if (!listing) return { content: [{ type: "text", text: `Not found: ${path}` }], isError: true };
        if (!Array.isArray(listing)) {
          return {
            content: [{ type: "text", text: `${path} is a file, not a directory` }],
            isError: true,
          };
        }
        const names = listing
          .map((f: { type: string; path: string }) => `${f.type === "dir" ? "📁" : "📄"} ${f.path}`)
          .join("\n");
        return { content: [{ type: "text", text: names || "(empty)" }] };
      }
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
