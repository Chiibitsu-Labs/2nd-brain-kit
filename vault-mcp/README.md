# vault-mcp — your Second Brain connector

A small remote MCP server that gives Claude (web, mobile, Claude Code) and
ChatGPT Business direct read/write access to **your** notes vault via the
GitHub API — no local Obsidian instance, no file sync, works from any
device.

> This is the connector that lives inside your vault repo. Most people
> never edit it — the step-by-step setup guide from Chiibitsu Labs walks
> you through deploying it. This file is the technical reference.

Obsidian itself is unaffected by this — it stays the vault and the writing
app. This is purely a bridge for AI clients that aren't already in a Claude
Code session with the repo attached.

## Tools exposed

- `read_file(path)` — read a file's contents
- `write_file(path, content, message)` — create/update a file, commits directly to the vault's branch (no PR — personal notes vault)
- `list_files(path)` — non-recursive directory listing

## Deploy (Vercel, free Hobby tier)

1. Import **your** vault repo into Vercel, set **Root Directory** to `vault-mcp`.
2. In the Vercel project's Environment Variables, set:
   - `VAULT_GITHUB_TOKEN` — a **fine-grained GitHub PAT**, scoped to only
     **your vault repo** (the one you just imported), with **Contents:
     Read and write** permission and nothing else. Create it at
     github.com → Settings → Developer settings → Fine-grained tokens.
   - `VAULT_MCP_TOKEN` — any long random string you generate yourself (e.g.
     `openssl rand -hex 32`). This is the bearer token AI clients must send
     to use the server — treat it like a password.
   - `OAUTH_SIGNING_SECRET` — another random string (`openssl rand -hex 32`),
     different from `VAULT_MCP_TOKEN`. Used to sign the OAuth codes/client
     IDs/access tokens issued to claude.ai and ChatGPT — never sent to any
     client in raw form, purely internal. Must be at least 32 characters or
     the OAuth endpoints refuse to operate.
   - `VAULT_OWNER_PASSPHRASE` — the passphrase YOU type into the browser
     form when claude.ai/ChatGPT asks to connect. **This is the actual
     access control on the vault**: without it, anyone who discovered the
     server URL could connect their own AI account, because every
     claude.ai/chatgpt.com user's OAuth flow arrives from the same trusted
     origins. Use a long random value (`openssl rand -hex 16` is fine) and
     keep it in your password manager. Wrong guesses are throttled (8 per
     caller address per 15 minutes), but that only slows a guesser down —
     entropy is still the real defense, so never a dictionary word. The
     authorize endpoint returns 503 and refuses all authorizations if this
     is unset.
   - `VAULT_OWNER` — **required**: your GitHub username (or org).
   - `VAULT_REPO` — **required**: your vault repo name.
   - `VAULT_BRANCH` (optional, defaults to `main`)
   - `VAULT_CONNECTOR_PATH` (optional, defaults to `vault-mcp`) — **set
     this if your vault keeps the connector anywhere other than the repo
     root**, and give it the same value as the Vercel **Root Directory**
     in step 1. They name the same folder.

     It matters because the protections below are matched from the start
     of the path, which assumes the connector sits at the root — the
     layout the deploy button produces. A vault that is also a project
     (say the connector lives at `02_builds/tools/vault-mcp`) has its
     running server code outside every one of them, and a write there
     rewrites the server and redeploys it. Setting this restores that
     protection wherever the connector actually lives. Set the *same*
     value as a repository variable of that name (Settings → Secrets and
     variables → Actions → Variables) and the kit's template sync will
     also update the right copy instead of creating an unused one at the
     root.

     It only ever *adds* a protected prefix, so a wrong value costs
     coverage of a path that was never protected anyway rather than
     unprotecting the defaults. It is a prefix, so pointing it at a
     parent (`02_builds/tools`) protects the siblings too, which is
     usually what such a vault wants.
   - `VAULT_PROTECTED_PREFIXES` (optional) — comma-separated *extra* path
     prefixes the connector refuses to write to, on top of the mandatory
     protections described below. It can only add, never remove one of
     them.
3. Deploy. Your endpoint is `https://<your-deployment>.vercel.app/api/mcp`.

### What the connector will never write

Read this before organising your vault, because there is no exemption
switch and the first sign of a clash is a refused write.

- **Every dotfile and dot-directory.** Anything whose path has a segment
  starting with `.` — `.github/`, `.claude/`, `.obsidian/`, `.vscode/`,
  `.cursor/`, `.gemini/`, and any tool folder that does not exist yet.
  Editors and coding agents keep their configuration there, and such a
  file decides what runs on your machine when the vault is next opened.
  A notes connector has no reason to write one. **If you keep notes or
  attachments in a hidden folder, move them somewhere ordinary** — the
  connector cannot write them where they are.
- **Files agents load as standing instructions, at any depth** —
  `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `AGENTS.override.md`,
  `AGENT.md`, `GEMINI.md`, `QWEN.md`, `WARP.md`. These are injected into
  an assistant's context verbatim, so a write there is a write into every
  future session's instructions. This applies at any depth: a note of
  your own named exactly `Claude.md` or `Gemini.md` is refused too.
- **Files that declare what a tool launches, at any depth** —
  `.mcp.json`, `opencode.json`, `opencode.jsonc`, `.devcontainer.json`.
  These name servers or commands to run, so a write there is closer to
  handing over a shell than to editing a document.
- **The server's own code and deploy config** — `vault-mcp/`, `tools/`,
  `package.json`, `package-lock.json`, `vercel.json`, `next.config.*`,
  `tsconfig.json`. These are matched from the **repo root**: if your
  connector lives somewhere else, set `VAULT_CONNECTOR_PATH` (above) or
  it is not covered by this line.

You can always create any of these by hand. Only the connector is barred.

**What this does not cover.** The list above is what the connector
refuses *by default*, and it is not the same as "nothing executable."
An ordinary path like `scripts/build.sh`, `Makefile` or `deploy/run.sh`
is writable, because to this connector it looks like any other file. If
your vault has paths like that — anything a CI job, a git hook or your
own tooling executes — **add them to `VAULT_PROTECTED_PREFIXES`**, or a
write there could run the next time that job does. A plain notes vault
has none of this; a vault that is also a project usually does.

`VAULT_OWNER` and `VAULT_REPO` have no defaults — the server refuses every
tool call until they're set, so a typo fails loudly instead of silently
pointing at the wrong repo.

**If `VAULT_MCP_TOKEN` is not set, the endpoint has no authentication** —
only acceptable for `next dev` on your own machine, never for the deployed
version. Always set it before sharing the URL with any AI client.

## Connect a client

**Claude Code** (adds it for every session on this machine, not just this repo):
```
claude mcp add --transport http vault https://<your-deployment>.vercel.app/api/mcp --scope user --header "Authorization: Bearer <VAULT_MCP_TOKEN>"
```
(All on one line — a line-continuation `\` followed by a blank/whitespace
line will silently break this in zsh, registering the server without the
header. `--scope user` matters too: without it, the server is only
available in Claude Code sessions started from the exact directory you ran
this in, not globally.)

**claude.ai (web/mobile/desktop)**: Settings → Connectors → Add custom
connector → paste just the URL (`https://<your-deployment>.vercel.app/api/mcp`)
and click Add. Leave the OAuth Client ID/Secret fields blank — this server
implements Dynamic Client Registration (`/api/oauth/register`), so
claude.ai registers itself automatically and no manual token/header entry
is needed or even possible in this UI (it only offers OAuth fields, not a
raw bearer-token/header option). During connect, a browser window opens
asking for the **owner passphrase** (`VAULT_OWNER_PASSPHRASE`) — that step
is what stops anyone else who finds the URL from connecting their own
account.

**ChatGPT Business**: requires an org Admin with Developer mode enabled,
then add a custom MCP app/plugin pointing at the same URL, Authentication
set to **OAuth** (ChatGPT only supports OAuth or no auth — same limitation
as claude.ai, no bearer/API-key option). The exact menu location moves
around as OpenAI renames things (Plugins ↔ Apps; Developer mode has lived
under Settings → Security/login and under Settings → Apps → Advanced) — the
step-by-step guide covers the current path, and both are checked there.
`chatgpt.com`/`chat.openai.com` are in the redirect_uri allowlist
(`lib/oauth.ts`).

## Security model

What gates what:

- **The MCP endpoint** (`/api/mcp`) requires a bearer token: either the
  static `VAULT_MCP_TOKEN` (owner-only, lives in Claude Code CLI config)
  or a **signed, 30-day-expiring access token** issued by the OAuth flow.
  Connectors never receive the static master token. Comparisons are
  timing-safe. Fails closed in production if `VAULT_MCP_TOKEN` is unset.
- **The OAuth authorize step** requires `VAULT_OWNER_PASSPHRASE`, entered
  by a human in a browser form. This is the real gate — the redirect
  origin allowlist only controls where codes can be sent, not who can ask.
- **PKCE (S256) is mandatory**; authorization codes expire in 5 minutes
  and are bound to the redirect_uri and code challenge.
- **The GitHub PAT** is fine-grained: one repo, Contents read/write only —
  worst case if the server is fully compromised is bounded at this repo.
- **Passphrase attempts are throttled**: 8 per caller address per 15
  minutes, after which the form returns `429` until the window passes. An
  attempt is claimed *before* the passphrase is compared, so a burst of
  simultaneous guesses can't slip through together. Getting it right
  releases the whole tally, so a mistype or three costs you nothing.

  Cross-site form posts to the authorize endpoint are refused before any
  budget is spent, so a hostile page you merely visit can't burn your
  attempts and keep you from connecting.

  Spend all 8 and you're held for the rest of the window — **including
  you, with the right passphrase**. That's not an oversight: a request
  that's out of budget must not reach the comparison, or an attacker gets
  unlimited guesses and the throttle is decoration. The wait is capped at
  15 minutes and nothing is lost; if you'd rather have more room before
  that happens, raise `PASSPHRASE_MAX_ATTEMPTS` in
  `app/api/oauth/authorize/route.ts`.

Single-use authorization codes and durable throttling (optional, recommended):

- Add an **Upstash Redis** store via the Vercel Marketplace (free tier;
  the successor to the now-deprecated Vercel KV). The marketplace
  integration auto-injects `KV_REST_API_URL`/`KV_REST_API_TOKEN` (or
  `UPSTASH_REDIS_REST_URL`/`_TOKEN`) — the server picks up whichever is
  present, no code change. With it configured, each authorization code
  can be exchanged exactly once (atomic `SET NX`); a replay is rejected.
  The same store also holds the passphrase-attempt tally, which makes the
  throttle above count correctly across serverless instances.
- **Without** a KV store the server still works — it just falls back to
  the stateless behavior below.

Remaining limitations:

- Without a KV store, authorization codes are not strictly single-use —
  replay within the 5-minute window is possible **only** by someone who
  also holds the PKCE code_verifier, which never transits the browser.
- Without a KV store — or during a KV outage — the passphrase throttle
  falls back to per-instance memory and the count restarts. Serverless
  instances are ephemeral and several can be warm at once, so a guesser
  gets more than 8 tries per window: slower than unlimited, but not the
  stated limit. Exactly one store decides at a time, deliberately —
  combining them produced lockouts that outlived the window that caused
  them, and locking you out of your own vault is the worse failure.
- The throttle is per caller address either way. It does not stop a
  guesser spread across many addresses; a global cap would, but a global
  cap is also a lockout any stranger could trigger against you. So the
  passphrase itself is still the last line: use high entropy, never a
  memorable word.
- Rotating `VAULT_MCP_TOKEN` invalidates the CLI credential only; rotating
  `OAUTH_SIGNING_SECRET` invalidates every OAuth-issued token and forces
  all connectors to re-authorize (that's the "log everyone out" lever).

## Why GitHub API instead of the Obsidian Local REST API plugin

The Local REST API plugin only works while Obsidian is open on one specific
machine, and claude.ai (browser-based) can't reach a localhost server at
all. Going through the GitHub API instead means this works whether or not
Obsidian is running, from any device, since the vault's source of truth is
already this repo.
