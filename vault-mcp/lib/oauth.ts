import crypto from "node:crypto";

// Trusted redirect_uri origins. Checked by origin only (not exact path),
// since each surface uses more than one callback path.
//
// SECURITY NOTE: origin allowlisting is NOT an access-control boundary —
// every claude.ai/chatgpt.com user's connector flow arrives from these
// same origins. The thing that actually gates access to the vault is the
// owner-passphrase check in /api/oauth/authorize. This list only limits
// where authorization codes can be redirected.
export const ALLOWED_REDIRECT_ORIGINS = [
  "https://claude.ai",
  "https://claude.com",
  "https://chatgpt.com",
  "https://chat.openai.com",
];

const SECRET = process.env.OAUTH_SIGNING_SECRET || "";

export function hasSigningSecret(): boolean {
  // Anything shorter than 32 chars is treated as unconfigured — an empty
  // or trivial HMAC key would make every signed token forgeable.
  return SECRET.length >= 32;
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

// The three kinds of signed string this server hands out. All three are
// signed with the same key, so without a label inside them the only thing
// keeping one from being presented in another's place is that each
// verifier happens to require a field the other kinds don't carry — an
// access token has no `redirect_uri`, a client_id has no `sub`, and so
// on. That separation holds today, but it is a property of four call
// sites rather than of the token format, and it would quietly stop
// holding the first time two payload shapes converged. `typ` states the
// kind in the payload so the check is explicit and local.
export type TokenType = "authorization_code" | "client_registration" | "access_token";

// Whether a token with no `typ` at all is rejected.
//
// Left off by default because turning it on invalidates every token
// issued before this shipped: live connectors would need to reconnect and
// registered clients to re-register. A vault deployed fresh should set
// `OAUTH_REQUIRE_TYP=1` immediately — it has no legacy tokens to break.
//
// On an upgraded vault, waiting does not make it free, and an earlier
// draft of this comment claimed it did. Access tokens last 30 days but
// client registrations last a year, so a legacy registration outlives the
// access token by eleven months — and it is checked at the very start of
// the authorization that would otherwise re-issue everything, so a client
// holding one cannot reconnect its way out. Enabling this on an upgraded
// vault means each connected client is removed and re-added once. See
// README.md for what to tell the vault's owner.
//
// Leaving it off is not a lingering risk: the mismatch half below is
// unconditional, so all this adds is refusing tokens that declare no kind
// at all — every one of which this same server issued before the upgrade.
//
// Read at call time, not module load: `next dev` and the test harness
// both mutate the environment between requests, and a module-level
// snapshot would freeze whichever value happened to be set first.
function requireTyp(): boolean {
  const v = (process.env.OAUTH_REQUIRE_TYP || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

// Self-contained, signed tokens (payload + HMAC) — no database needed,
// safe for a stateless serverless deployment. Verification just re-checks
// the signature, the embedded expiry, and the token's declared kind.
export function issueSignedToken(
  typ: TokenType,
  data: Record<string, unknown>,
  ttlSeconds: number
): string {
  if (!hasSigningSecret()) {
    throw new Error("OAUTH_SIGNING_SECRET is not configured (need >= 32 chars)");
  }
  // `typ` and `exp` are written after the spread, so a caller can never
  // mislabel a token or extend its own lifetime by passing either key in
  // `data`.
  const payload = JSON.stringify({ ...data, typ, exp: Math.floor(Date.now() / 1000) + ttlSeconds });
  const encoded = base64url(payload);
  return `${encoded}.${sign(encoded)}`;
}

export function verifySignedToken<T = Record<string, unknown>>(
  token: string,
  expectedTyp: TokenType
): T | null {
  if (!hasSigningSecret()) return null; // fail closed, never verify against an empty key
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!timingSafeEqualStrings(sign(encoded), sig)) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
  if (typeof data.exp !== "number" || data.exp < Math.floor(Date.now() / 1000)) return null;
  // A token that declares a kind must declare *this* kind. This half is
  // unconditional: a mismatch is never a legacy token, it is one kind
  // being presented where another belongs.
  if ("typ" in data) {
    if (data.typ !== expectedTyp) return null;
  } else if (requireTyp()) {
    return null;
  }
  return data as T;
}

// Constant-time string comparison. Hashing first normalizes lengths so
// timingSafeEqual can be used on inputs of differing length without
// leaking length information through an early return.
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const da = crypto.createHash("sha256").update(a).digest();
  const db = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(da, db);
}

export function isAllowedRedirectUri(redirectUri: string): boolean {
  try {
    const origin = new URL(redirectUri).origin;
    return ALLOWED_REDIRECT_ORIGINS.includes(origin);
  } catch {
    return false;
  }
}

export function sha256Base64Url(input: string): string {
  return crypto.createHash("sha256").update(input).digest("base64url");
}
