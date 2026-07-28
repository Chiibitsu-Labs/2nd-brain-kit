import crypto from "node:crypto";
import {
  hasSigningSecret,
  isAllowedRedirectUri,
  issueSignedToken,
  timingSafeEqualStrings,
  verifySignedToken,
} from "../../../../lib/oauth";
import { callerBucket, clearAttempts, reserveAttempt } from "../../../../lib/ratelimit";
import { isCrossSitePost } from "../../../../lib/samesite";

// Passphrase attempt budget per caller, per window. A guesser is held to a
// few hundred tries a day instead of as many as the network will carry.
//
// Getting it right within the remaining budget clears the count, so a few
// fumbles cost nothing. Spending the budget outright is different: the next
// request is refused before any comparison, so the correct passphrase is
// refused too until the window turns over. That is deliberate — an
// over-budget request that still compared would hand a guesser unlimited
// attempts — but it does mean the owner can lock themselves out for up to
// PASSPHRASE_WINDOW_SECONDS. Raise this if that trade feels wrong.
const PASSPHRASE_MAX_ATTEMPTS = 8;
const PASSPHRASE_WINDOW_SECONDS = 15 * 60;

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

function waitLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function passphraseForm(
  p: OAuthParams,
  opts: { badPassphrase?: boolean; throttledSeconds?: number } = {}
): Response {
  const clientHost = new URL(p.redirectUri).hostname;
  const throttled = typeof opts.throttledSeconds === "number";
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
${
  // The controls below are disabled while throttled, and nothing on a
  // static page re-enables them — so someone who does exactly what the
  // message says, waits, would find the form still dead and no hint that a
  // reload is what fixes it. Reload it for them one second after the wait
  // ends. A meta refresh always issues a GET, so this re-renders the form
  // rather than resubmitting the passphrase.
  throttled ? `<meta http-equiv="refresh" content="${(opts.throttledSeconds as number) + 1}">` : ""
}
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
  <input type="password" name="passphrase" placeholder="Owner passphrase" ${throttled ? "disabled" : "autofocus"} autocomplete="current-password">
  ${opts.badPassphrase ? '<div class="err">Wrong passphrase.</div>' : ""}
  ${
    throttled
      ? `<div class="err">Too many attempts from this network. Try again in ${escapeHtml(
          waitLabel(opts.throttledSeconds as number)
        )} — the right passphrase won't be accepted until then either, which is what stops guessing. Nothing in your vault has changed.<br><br>This page re-enables itself when the wait is over. If you'd rather not leave it open, come back and reload.</div>`
      : ""
  }
  <button type="submit" ${throttled ? "disabled" : ""}>Authorize</button>
</form></body></html>`;
  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  };
  let status = 200;
  if (throttled) {
    status = 429;
    headers["retry-after"] = String(opts.throttledSeconds);
  } else if (opts.badPassphrase) {
    status = 401;
  }
  return new Response(html, { status, headers });
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
  // Before the body is read, and well before any budget is spent.
  if (isCrossSitePost(req)) {
    return new Response("Cross-site form submissions are not accepted here.", {
      status: 403,
      headers: { "cache-control": "no-store" },
    });
  }
  const form = new URLSearchParams(await req.text());
  const v = validateParams(form);
  if ("err" in v) return v.err;

  // Spend an attempt *before* comparing. Reserving up front is what makes
  // the budget hold under concurrency: a check that only reads, and counts
  // afterwards, would admit every request in a simultaneous batch before
  // any of them had counted. A caller who is out of budget gets no signal
  // from this request at all — not even the timing of a comparison.
  const bucket = callerBucket(req);
  const verdict = await reserveAttempt(bucket, PASSPHRASE_MAX_ATTEMPTS, PASSPHRASE_WINDOW_SECONDS);
  if (!verdict.allowed) {
    return passphraseForm(v.ok, { throttledSeconds: verdict.retryAfterSeconds });
  }

  const passphrase = form.get("passphrase") || "";
  if (!timingSafeEqualStrings(passphrase, OWNER_PASSPHRASE)) {
    return passphraseForm(v.ok, { badPassphrase: true });
  }
  // Correct passphrase: release every attempt that led here, so a few
  // mistypes never carry over into a lockout later in the day.
  await clearAttempts(bucket);

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
