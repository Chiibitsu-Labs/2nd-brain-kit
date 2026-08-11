// Behavioural tests for the signed-token layer, run by `npm test` and by
// CI. The connector's other checks are a typecheck and an audit, neither
// of which can tell whether a token of one kind is accepted where another
// belongs — which is the whole property this file exists to hold down.
//
// Needs OAUTH_SIGNING_SECRET (>= 32 chars); `npm test` generates one, so
// nothing here depends on a real deployment's secret.
import crypto from "node:crypto";
import { issueSignedToken, verifySignedToken } from "./oauth";

let fail = 0;
function check(name: string, cond: boolean) {
  console.log((cond ? "ok   " : "FAIL ") + name);
  if (!cond) fail++;
}

// Forge a legacy (pre-typ) token the way the old code did, so the
// leniency path is exercised against a real untyped payload rather than
// a hand-edited one.
function legacyToken(data: Record<string, unknown>, ttl: number): string {
  const secret = process.env.OAUTH_SIGNING_SECRET!;
  const payload = JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttl });
  const encoded = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

const access = issueSignedToken("access_token", { sub: "vault-owner" }, 60);
const code = issueSignedToken("authorization_code", { redirect_uri: "https://claude.ai/x" }, 60);
const client = issueSignedToken("client_registration", { redirect_uris: ["https://claude.ai/x"] }, 60);

check("access verifies as access_token", verifySignedToken(access, "access_token") !== null);
check("code verifies as authorization_code", verifySignedToken(code, "authorization_code") !== null);
check("client verifies as client_registration", verifySignedToken(client, "client_registration") !== null);

check("access rejected as authorization_code", verifySignedToken(access, "authorization_code") === null);
check("access rejected as client_registration", verifySignedToken(access, "client_registration") === null);
check("code rejected as access_token", verifySignedToken(code, "access_token") === null);
check("code rejected as client_registration", verifySignedToken(code, "client_registration") === null);
check("client rejected as access_token", verifySignedToken(client, "access_token") === null);
check("client rejected as authorization_code", verifySignedToken(client, "authorization_code") === null);

// A caller cannot mislabel a token or extend its life through `data`.
const spoofed = issueSignedToken("access_token", { typ: "authorization_code", exp: 9_999_999_999 }, 60);
check("data.typ cannot override the stamped kind", verifySignedToken(spoofed, "access_token") !== null);
check("data.typ spoof does not verify as the injected kind", verifySignedToken(spoofed, "authorization_code") === null);
const decoded = JSON.parse(Buffer.from(spoofed.split(".")[0], "base64url").toString()) as { exp: number };
check("data.exp cannot extend the lifetime", decoded.exp < 9_999_999_999);

// Legacy tokens: accepted while lenient, refused once strict.
const legacyAccess = legacyToken({ sub: "vault-owner" }, 60);
delete process.env.OAUTH_REQUIRE_TYP;
check("lenient: legacy untyped token still accepted", verifySignedToken(legacyAccess, "access_token") !== null);
process.env.OAUTH_REQUIRE_TYP = "1";
check("strict: legacy untyped token refused", verifySignedToken(legacyAccess, "access_token") === null);
check("strict: freshly typed token still accepted", verifySignedToken(access, "access_token") !== null);
delete process.env.OAUTH_REQUIRE_TYP;

// Signature is still the first gate.
check("tampered payload refused", verifySignedToken("x" + access, "access_token") === null);
const expired = issueSignedToken("access_token", { sub: "vault-owner" }, -1);
check("expired token refused", verifySignedToken(expired, "access_token") === null);

console.log(fail === 0 ? "\nall passed" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
