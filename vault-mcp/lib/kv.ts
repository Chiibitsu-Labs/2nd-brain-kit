import { Redis } from "@upstash/redis";

// Optional single-use-code store, backed by Upstash Redis (the successor
// to the deprecated Vercel KV). Reads whichever env var pair the Vercel
// Upstash marketplace integration injected — it uses KV_REST_API_* on
// some projects and UPSTASH_REDIS_REST_* on others.
const URL_ENV = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN_ENV = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

let client: Redis | null = null;
if (URL_ENV && TOKEN_ENV) {
  // One SET per request — auto-pipelining buys nothing here and makes the
  // response path harder to reason about, so keep it off.
  client = new Redis({ url: URL_ENV, token: TOKEN_ENV, enableAutoPipelining: false });
}

export function kvConfigured(): boolean {
  return client !== null;
}

// The shared client, for stores other than the single-use code set (see
// lib/ratelimit.ts). Null when Upstash isn't configured — callers decide
// how to degrade rather than being handed a client that throws.
export function getRedis(): Redis | null {
  return client;
}

// Atomically claim a one-time key. Returns true the first time a given
// jti is seen, false on any replay. SET NX is atomic on Redis, so two
// concurrent token requests for the same code can't both win. The key
// auto-expires so the store never grows unbounded.
//
// If KV isn't configured this returns true (the stateless fallback — the
// 5-minute PKCE-bound window still applies, it's just not strictly
// single-use). Callers that require strict single-use should check
// kvConfigured() and fail closed themselves.
export async function claimOnce(jti: string, ttlSeconds: number): Promise<boolean> {
  if (!client) return true;
  const res = await client.set(`code:${jti}`, "1", { nx: true, ex: ttlSeconds });
  return res === "OK";
}
