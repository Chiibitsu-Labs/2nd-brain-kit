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

// Self-contained, signed tokens (payload + HMAC) — no database needed,
// safe for a stateless serverless deployment. Verification just re-checks
// the signature and an expiry embedded in the payload.
export function issueSignedToken(data: Record<string, unknown>, ttlSeconds: number): string {
  if (!hasSigningSecret()) {
    throw new Error("OAUTH_SIGNING_SECRET is not configured (need >= 32 chars)");
  }
  const payload = JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttlSeconds });
  const encoded = base64url(payload);
  return `${encoded}.${sign(encoded)}`;
}

export function verifySignedToken<T = Record<string, unknown>>(token: string): T | null {
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
