import { getRedis } from "./kv";

// Failed-attempt throttling for the owner-passphrase gate.
//
// The passphrase is the only thing standing between a stranger who knows
// the server URL and the vault: the redirect-origin allowlist can't tell
// the owner apart from any other claude.ai/chatgpt.com user, and client
// registration is open. Without a throttle, that gate can be guessed at
// as fast as the network allows.
//
// Only *failures* are counted, and a success clears the bucket — so an
// owner who fumbles the passphrase a few times is never locked out of
// their own vault, while a guesser is cut to a few tries per window.
//
// Scope note, deliberately not papered over: this is per-caller-IP. It
// raises the cost of a single-source attack by orders of magnitude; it
// does not stop an attacker spread across many addresses. A global cap
// would, but a global cap is also a lockout any anonymous stranger could
// trigger against the owner, which is a worse failure than the one it
// prevents. Passphrase strength remains the defense of last resort.

export type RateLimitVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

const PREFIX = "pplimit:";

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------

// Used when no KV store is configured, and as the backstop when a
// configured store is unreachable. Serverless instances are ephemeral and
// there can be several warm at once, so this is per-instance and leaky by
// nature — an attacker who happens to land on fresh instances gets more
// attempts than the nominal limit. It is still far better than no limit,
// and it degrades toward "slower attacker" rather than "locked-out owner".
type MemoryEntry = { count: number; expiresAtMs: number };
const memory = new Map<string, MemoryEntry>();

// Bounded so a stream of distinct source addresses can't grow the map
// without limit — that would turn a brute-force defense into a memory
// exhaustion vector.
const MEMORY_MAX_ENTRIES = 5000;

function memoryPrune(nowMs: number): void {
  for (const [k, v] of memory) {
    if (v.expiresAtMs <= nowMs) memory.delete(k);
  }
  if (memory.size < MEMORY_MAX_ENTRIES) return;
  // Still over budget with nothing expired: evict whichever entry frees up
  // soonest, so the eviction can never be aimed at a chosen victim.
  let oldestKey: string | null = null;
  let oldestExpiry = Infinity;
  for (const [k, v] of memory) {
    if (v.expiresAtMs < oldestExpiry) {
      oldestExpiry = v.expiresAtMs;
      oldestKey = k;
    }
  }
  if (oldestKey !== null) memory.delete(oldestKey);
}

// Introspection for tests, so the MEMORY_MAX_ENTRIES bound above can be
// asserted rather than argued. Returns a count, never any key material,
// and is not reachable over HTTP.
export function memoryEntryCount(): number {
  return memory.size;
}

function memoryCheck(key: string, limit: number, nowMs: number): RateLimitVerdict {
  const entry = memory.get(key);
  if (!entry || entry.expiresAtMs <= nowMs) return { allowed: true };
  if (entry.count < limit) return { allowed: true };
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.expiresAtMs - nowMs) / 1000)) };
}

function memoryRegisterFailure(key: string, windowSeconds: number, nowMs: number): void {
  const entry = memory.get(key);
  if (!entry || entry.expiresAtMs <= nowMs) {
    memoryPrune(nowMs);
    // Fixed window anchored at the first failure — later failures inside
    // the window raise the count but never extend it, so an attacker
    // cannot stretch a lockout the owner might be sharing an IP with.
    memory.set(key, { count: 1, expiresAtMs: nowMs + windowSeconds * 1000 });
    return;
  }
  entry.count += 1;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Read-only: does not consume an attempt. Call this before comparing the
// passphrase so a throttled request never reaches the comparison at all.
export async function checkAttemptAllowed(
  bucket: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitVerdict> {
  const key = PREFIX + bucket;
  const nowMs = Date.now();
  const redis = getRedis();
  if (redis) {
    try {
      const count = Number((await redis.get<string | number>(key)) ?? 0);
      if (!Number.isFinite(count) || count < limit) return { allowed: true };
      const ttl = await redis.ttl(key);
      // ttl < 0 means no key or no expiry set; treat as one full window
      // rather than as "never expires", so a bad TTL can't strand the owner.
      const retryAfterSeconds = ttl > 0 ? ttl : windowSeconds;
      return { allowed: false, retryAfterSeconds };
    } catch {
      // Store unreachable. Fall through to the in-memory limiter rather
      // than 500ing the owner out of their own connector flow — some
      // throttling, and the passphrase check itself, still apply.
    }
  }
  return memoryCheck(key, limit, nowMs);
}

// Call after a passphrase comparison fails.
export async function registerFailedAttempt(bucket: string, windowSeconds: number): Promise<void> {
  const key = PREFIX + bucket;
  const redis = getRedis();
  if (redis) {
    try {
      const count = await redis.incr(key);
      // Set the expiry only on the first failure, which makes this a fixed
      // window rather than a sliding one. INCR on a missing key creates it
      // with no TTL, so this call is what keeps the key from living forever.
      if (count === 1) await redis.expire(key, windowSeconds);
      return;
    } catch {
      // Fall through and at least record it in memory.
    }
  }
  memoryRegisterFailure(key, windowSeconds, Date.now());
}

// Call after a successful passphrase entry, so an owner who mistyped a few
// times starts clean.
export async function clearFailedAttempts(bucket: string): Promise<void> {
  const key = PREFIX + bucket;
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(key);
    } catch {
      // Non-fatal: the bucket expires on its own.
    }
  }
  memory.delete(key);
}

// The caller's address, as seen by the platform's proxy.
//
// On Vercel both headers are set by the edge and the client cannot forge
// them. Behind some other proxy, or none, they may be attacker-controlled
// — in which case this degrades to the shared "unknown" bucket or to a
// per-forged-value bucket, and the throttle weakens accordingly. That is a
// deployment property, not something this function can verify, so it is
// stated here rather than assumed away.
export function callerBucket(req: Request): string {
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}
