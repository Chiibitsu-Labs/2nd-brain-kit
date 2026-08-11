import { ALLOWED_REDIRECT_ORIGINS, hasSigningSecret, isAllowedRedirectUri, issueSignedToken } from "../../../../lib/oauth";

// Minimal Dynamic Client Registration (RFC 7591). Stateless: the returned
// client_id is a signed token encoding the caller's own redirect_uris, so
// there's nothing to persist. Public clients only (PKCE carries the
// security, so no client_secret is issued or required).
export async function POST(req: Request) {
  if (!hasSigningSecret()) {
    return Response.json(
      { error: "server_error", error_description: "OAUTH_SIGNING_SECRET not configured (need >= 32 chars)" },
      { status: 503 }
    );
  }
  let body: { redirect_uris?: unknown; client_name?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_client_metadata" }, { status: 400 });
  }

  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (redirectUris.length === 0 || !redirectUris.every(isAllowedRedirectUri)) {
    return Response.json(
      {
        error: "invalid_redirect_uri",
        error_description: `redirect_uris must all be under one of: ${ALLOWED_REDIRECT_ORIGINS.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const clientId = issueSignedToken("client_registration", { redirect_uris: redirectUris }, 60 * 60 * 24 * 365);

  return Response.json({
    client_id: clientId,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
    client_name: typeof body.client_name === "string" ? body.client_name : "vault-mcp client",
  });
}
