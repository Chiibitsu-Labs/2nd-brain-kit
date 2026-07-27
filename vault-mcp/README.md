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
   - `VAULT_PROTECTED_PREFIXES` (optional) — comma-separated *extra* path
     prefixes the connector refuses to write to, on top of a fixed
     mandatory list (`.github/`, `.vercel/`, `vault-mcp/`, `tools/`,
     `.claude/`, `.obsidian/plugins/`) that's always protected regardless
     of this setting — there's no legitimate layout where an AI should be
     able to rewrite the server's own code or auto-run hooks/plugins, so
     this variable can only add more protected paths, never remove one of
     the mandatory ones.
3. Deploy. Your endpoint is `https://<your-deployment>.vercel.app/api/mcp`.

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
