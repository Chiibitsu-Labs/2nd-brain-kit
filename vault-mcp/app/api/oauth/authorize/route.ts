import crypto from "node:crypto";
import {
  hasSigningSecret,
  isAllowedRedirectUri,
  issueSignedToken,
  timingSafeEqualStrings,
  verifySignedToken,
} from "../../../../lib/oauth";

// THE access-control boundary for this server. The redirect-origin
// allowlist can't distinguish the vault owner from any other claude.ai or
// chatgpt.com user (everyone's connector flow arrives from the same
// origins), so authorization requires the owner passphrase — without this
// gate, anyone who discovers the server URL could connect their own AI
// account to the vault. Fails closed if VAULT_OWNER_PASSPHRASE is unset.
const OWNER_PASSPHRASE = process.env.VAULT_OWNER_PASSPHRASE || "";

// A friendly, client-specific label for the consent page, derived from the
// configured repo (e.g. "my-second-brain" → "My Second Brain"). Never
// hard-codes any one owner's vault name.
function vaultLabel(): string {
  const repo = process.env.VAULT_REPO || "";
  if (!repo) return "Your Vault";
  return repo.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type OAuthParams = {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
};

function validateParams(params: URLSearchParams): { ok: OAuthParams } | { err: Response } {
  const clientId = params.get("client_id") || "";
  const redirectUri = params.get("redirect_uri") || "";
  const state = params.get("state") || "";
  const codeChallenge = params.get("code_challenge") || "";
  const codeChallengeMethod = params.get("code_challenge_method");
  const responseType = params.get("response_type");

  const client = verifySignedToken<{ redirect_uris: string[] }>(clientId);
  const redirectUriIsRegistered = !!client?.redirect_uris?.includes(redirectUri);

  // Never redirect to a redirect_uri that hasn't been validated (open
  // redirect); reject in-place instead.
  if (!redirectUriIsRegistered || !isAllowedRedirectUri(redirectUri)) {
    return { err: new Response("invalid client_id or unregistered redirect_uri", { status: 400 }) };
  }
  if (responseType !== "code") {
    return { err: redirectWithError(redirectUri, state, "unsupported_response_type") };
  }
  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return { err: redirectWithError(redirectUri, state, "invalid_request", "PKCE S256 code_challenge is required") };
  }
  return { ok: { clientId, redirectUri, state, codeChallenge } };
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function passphraseForm(p: OAuthParams, opts: { badPassphrase?: boolean } = {}): Response {
  const clientHost = new URL(p.redirectUri).hostname;
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(vaultLabel())} — Authorize</title>
<style>
  body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#111;color:#eee}
  form{background:#1c1c1c;padding:2rem;border-radius:12px;max-width:22rem;width:90%}
  h1{font-size:1.1rem;margin:0 0 .5rem}
  p{font-size:.85rem;color:#aaa;margin:.25rem 0 1rem}
  input[type=password]{width:100%;padding:.6rem;border-radius:8px;border:1px solid #444;background:#111;color:#eee;box-sizing:border-box}
  button{margin-top:1rem;width:100%;padding:.6rem;border-radius:8px;border:0;background:#7c5cff;color:#fff;font-weight:600;cursor:pointer}
  .err{color:#ff7a7a;font-size:.85rem;margin-top:.5rem}
</style></head><body>
<form method="POST">
  <h1>🌱 ${escapeHtml(vaultLabel())}</h1>
  <p><b>${escapeHtml(clientHost)}</b> is requesting read/write access to your vault. Enter the owner passphrase to allow it.</p>
  <input type="hidden" name="client_id" value="${escapeHtml(p.clientId)}">
  <input type="hidden" name="redirect_uri" value="${escapeHtml(p.redirectUri)}">
  <input type="hidden" name="state" value="${escapeHtml(p.state)}">
  <input type="hidden" name="code_challenge" value="${escapeHtml(p.codeChallenge)}">
  <input type="hidden" name="code_challenge_method" value="S256">
  <input type="hidden" name="response_type" value="code">
  <input type="password" name="passphrase" placeholder="Owner passphrase" autofocus autocomplete="current-password">
  ${opts.badPassphrase ? '<div class="err">Wrong passphrase.</div>' : ""}
  <button type="submit">Authorize</button>
</form></body></html>`;
  return new Response(html, {
    status: opts.badPassphrase ? 401 : 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function misconfigured(): Response {
  return new Response(
    "Server not configured: VAULT_OWNER_PASSPHRASE and OAUTH_SIGNING_SECRET must be set. Refusing to authorize.",
    { status: 503 }
  );
}

export async function GET(req: Request) {
  if (!OWNER_PASSPHRASE || !hasSigningSecret()) return misconfigured();
  const v = validateParams(new URL(req.url).searchParams);
  if ("err" in v) return v.err;
  return passphraseForm(v.ok);
}

export async function POST(req: Request) {
  if (!OWNER_PASSPHRASE || !hasSigningSecret()) return misconfigured();
  const form = new URLSearchParams(await req.text());
  const v = validateParams(form);
  if ("err" in v) return v.err;

  const passphrase = form.get("passphrase") || "";
  if (!timingSafeEqualStrings(passphrase, OWNER_PASSPHRASE)) {
    return passphraseForm(v.ok, { badPassphrase: true });
  }

  // jti = unique code id, so the token endpoint can claim it exactly once
  // (single-use) when a KV store is configured.
  const code = issueSignedToken(
    { redirect_uri: v.ok.redirectUri, code_challenge: v.ok.codeChallenge, jti: crypto.randomUUID() },
    300
  );
  const redirectTo = new URL(v.ok.redirectUri);
  redirectTo.searchParams.set("code", code);
  if (v.ok.state) redirectTo.searchParams.set("state", v.ok.state);
  return Response.redirect(redirectTo.toString(), 302);
}

function redirectWithError(redirectUri: string, state: string, error: string, description?: string) {
  const redirectTo = new URL(redirectUri);
  redirectTo.searchParams.set("error", error);
  if (description) redirectTo.searchParams.set("error_description", description);
  if (state) redirectTo.searchParams.set("state", state);
  return Response.redirect(redirectTo.toString(), 302);
}
