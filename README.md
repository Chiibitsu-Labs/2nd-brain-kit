# 🌱 Your Second Brain

This is your personal notes vault, wired so that **Claude and ChatGPT can
read and write it for you** — from your laptop or your phone — while
everything stays in a private repository that belongs to you.

You don't need to be technical to use this. There's no code to write.

## Start here → one button

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/chiibitsu-labs/2nd-brain-kit&root-directory=vault-mcp&project-name=my-second-brain&repository-name=my-second-brain&env=VAULT_GITHUB_TOKEN,VAULT_MCP_TOKEN,OAUTH_SIGNING_SECRET,VAULT_OWNER_PASSPHRASE,VAULT_OWNER,VAULT_REPO)

That button does three things at once, all in your browser:

1. **Copies this whole kit into your own GitHub** (that copy becomes your
   vault — the one place your notes live).
2. **Puts the little “librarian” server online** (free) so your AI can
   reach the vault.
3. **Asks you for your keys** (a short form — the setup guide walks you
   through each one).

After that, you connect Claude and ChatGPT and you're done. **Follow the
step-by-step guide from Chiibitsu Labs — it explains every box.**

## What's in here

- `vault-mcp/` — the small server that lets your AI read and write your
  notes (you never edit this).
- `.claude/` — the “improve” memory skill that captures what your AI
  learns about you and reads it back next time.
- `00_moc/`, `daily/`, `notes/`, `ai-improvements/` — your starting note
  folders. Make them yours.

## Is this safe?

Your notes live in **your** private GitHub repo and **your** free Vercel
account — no third-party service in the middle. When an AI wants to
connect, it has to pass a passphrase that only you know. See the guide's
“What keeps it safe” section, or hand your IT person the “For your IT /
CTO” section — it answers the “why does this touch GitHub?” question
directly.

---
*Second Brain Kit by **Chiibitsu Labs** — [chiibitsu.com](https://chiibitsu.com) · labs@chiibitsu.com*
