import { hasSigningSecret, issueSignedToken, sha256Base64Url, verifySignedToken } from "../../../../lib/oauth";
import { claimOnce } from "../../../../lib/kv";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  let params: URLSearchParams;
  if (contentType.includes("application/json")) {
    const body = await req.json();
    params = new URLSearchParams(body);
  } else {
    // Standard OAuth token requests are application/x-www-form-urlencoded.
    params = new URLSearchParams(await req.text());
  }

  const grantType = params.get("grant_type");
  const code = params.get("code") || "";
  const redirectUri = params.get("redirect_uri") || "";
  const codeVerifier = params.get("code_verifier") || "";

  if (grantType !== "authorization_code") {
    return Response.json({ error: "unsupported_grant_type" }, { status: 400 });
  }

  const decoded = verifySignedToken<{ redirect_uri: string; code_challenge: string; jti?: string }>(code);
  if (!decoded) {
    return Response.json({ error: "invalid_grant", error_description: "code is invalid or expired" }, { status: 400 });
  }
  if (decoded.redirect_uri !== redirectUri) {
    return Response.json({ error: "invalid_grant", error_description: "redirect_uri mismatch" }, { status: 400 });
  }
  if (!codeVerifier || sha256Base64Url(codeVerifier) !== decoded.code_challenge) {
    return Response.json({ error: "invalid_grant", error_description: "code_verifier does not match code_challenge" }, { status: 400 });
  }
  if (!hasSigningSecret()) {
    return Response.json({ error: "server_error", error_description: "OAUTH_SIGNING_SECRET not configured" }, { status: 500 });
  }

  // Single-use enforcement: claim this code's jti exactly once. Atomic
  // SET NX in Redis, so a replayed code (same jti) is rejected. No-ops to
  // allowed when no KV store is configured (stateless fallback — the
  // 5-minute PKCE-bound window still applies).
  if (decoded.jti && !(await claimOnce(decoded.jti, 300))) {
    return Response.json({ error: "invalid_grant", error_description: "authorization code already used" }, { status: 400 });
  }

  // A scoped, expiring signed token — never the static VAULT_MCP_TOKEN.
  // OAuth clients each get their own revocable-by-rotation credential;
  // the master token stays in the owner's hands (CLI config) only.
  const accessToken = issueSignedToken({ sub: "vault-owner", via: "oauth" }, ACCESS_TOKEN_TTL_SECONDS);

  return Response.json({
    access_token: accessToken,
    token_type: "bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
  });
}
