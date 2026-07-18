# Backups & how to undo things

Your notes are safer than they feel. Here's the honest picture, and the
extra redundancy you can turn on.

## First: what can actually go wrong?

The AI connector can do exactly three things: **read a note, list notes,
and write (create/update) a note.** There is **no delete** — an AI cannot
remove a file through this connector.

The real risk is an AI **overwriting a file's text** with something you
didn't want. That risk is narrowed, not eliminated, by a write guard: the
connector refuses writes to a specific protected list (server code, CI,
deploy config, Claude Code hooks, Obsidian plugin code — see the setup
guide's security section for the exact paths), but it's a blocklist, not a
notes-only allowlist, so it will still write to any other unprotected file
in the repo, not just your notes. Whatever gets overwritten, on any path,
is fully recoverable, because **every write is a saved version in
GitHub.** Nothing is ever truly lost — you can always see the before/after
and roll back.

### Undo a bad change (30 seconds, no coding)

1. On github.com, open your vault repo → click the note file → **History**.
2. Find the version from before the bad change → open it → **⋯ → View
   file** → copy the good text back in, or use **Revert**.
   (In Obsidian with the Git plugin, right-click the file → *Git: History*
   does the same.)

## Redundancy (optional — turn on what you like)

Two backup workflows ship in this kit, in `.github/workflows/`. Use one,
both, or neither.

### 1. Dated snapshots — `backup-snapshot.yml` (on by default)

Every week it creates a named restore point (a tag like `backup/2026-W29`).
Nothing to set up — it uses GitHub's own permissions — **unless your vault's
default branch isn't `main`** (an existing vault that was already on
`master`, for example, with a `VAULT_BRANCH` env var set on the connector).
In that case this workflow needs its own setting, separate from the
connector's: repo → **Settings → Secrets and variables → Actions →
Variables → New repository variable** → name it `VAULT_BRANCH` → value your
branch name. (Setting `VAULT_BRANCH` on Vercel only tells the *connector*
which branch to read/write — it does nothing for this workflow; GitHub
Actions variables and Vercel env vars are separate stores with the same
name by coincidence.) Skip this if your vault is on `main` — the default
already does the right thing.

- **Restore / download:** repo → **Tags** (or Releases) → pick a
  `backup/…` tag → **Download ZIP**, or `git checkout backup/2026-W29`.
- Change how often it runs by editing the `cron` line in the file.

### 2. Off-GitHub mirror — `backup-mirror.yml` (opt-in)

Pushes a full live copy to a **second git host** (GitLab, Codeberg,
Bitbucket, another GitHub account) so a copy exists completely outside
GitHub. This is the "two independent places" backup.

To turn it on:
1. Make a free empty repo on the second host (e.g. GitLab).
2. Create an access token there that can push to it.
3. In *this* repo: **Settings → Secrets and variables → Actions → New
   repository secret** → name it `BACKUP_MIRROR_URL`, value:
   `https://oauth2:YOUR_TOKEN@gitlab.com/you/vault-backup.git`
4. Done — every change now also lands on the second host. Until the secret
   is set, this workflow simply does nothing.

### 3. Bonus: a live copy on your computer / Google Drive

If you set up Obsidian + the Git plugin (see the setup guide), your
computer already holds a full copy. If you also did the NotebookLM step
(Google Drive for desktop mirroring your vault folder), that's a third
live copy. Redundancy adds up quietly.

---
*Second Brain Kit by **Chiibitsu Labs** — chiibitsu.com · labs@chiibitsu.com*
