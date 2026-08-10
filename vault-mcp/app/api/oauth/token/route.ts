import { hasSigningSecret, issueSignedToken, sha256Base64Url, verifySignedToken } from "../../../../lib/oauth";
import { claimOnce } from "../../../../lib/kv";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  let params: URLSearchParams;
  if (contentType.includes("application/json")) {
    // Both steps below throw on input a client can send, and an
    // exception here escapes as a 500 — telling the caller the server
    // broke when in fact their request was malformed. Every other
    // rejection on this route is a 400 with an OAuth error code, so the
    // one path that produced a 500 was the one reached by sending
    // garbage.
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: "invalid_request", error_description: "body is not valid JSON" },
        { status: 400 },
      );
    }
    // URLSearchParams takes a record of strings. Handed a JSON array it
    // throws ("Each query pair must be an iterable [name, value] tuple");
    // handed a scalar it silently coerces to a string and parses that as
    // a query, which yields junk params rather than an error. Neither is
    // a server fault, so both are refused here.
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return Response.json(
        { error: "invalid_request", error_description: "body must be a JSON object" },
        { status: 400 },
      );
    }
    // Values must be JSON primitives, checked *before* any coercion
    // rather than by wrapping the coercion in another try.
    //
    // `String(v)` is not safe on arbitrary parsed JSON. A body like
    // `{"grant_type":{"toString":null}}` gives the value an own
    // `toString` that shadows the inherited one and isn't callable, so
    // ToPrimitive finds no usable `toString` and no primitive-returning
    // `valueOf` and throws TypeError. That throw sits outside the try
    // above — which would have reintroduced the exact uncaught 500 this
    // change exists to remove, from the line meant to fix it.
    //
    // Refusing non-primitives removes the throw instead of catching it,
    // and drops the `[object Object]` coercion that let a nested object
    // masquerade as a grant type. Numbers and booleans are still
    // accepted and stringified: unambiguous, and a client sending them
    // is not malformed in any way this endpoint should care about.
    const entries: [string, string][] = [];
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") {
        return Response.json(
          { error: "invalid_request", error_description: "body values must be strings, numbers, or booleans" },
          { status: 400 },
        );
      }
      entries.push([k, String(v)]);
    }
    params = new URLSearchParams(entries);
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
