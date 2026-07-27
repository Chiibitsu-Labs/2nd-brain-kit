import { getRedis } from "./kv";

// Attempt throttling for the owner-passphrase gate.
//
// The passphrase is the only thing standing between a stranger who knows
// the server URL and the vault: the redirect-origin allowlist can't tell
// the owner apart from any other claude.ai/chatgpt.com user, and client
// registration is open. Without a throttle, that gate can be guessed at
// as fast as the network allows.
//
// An attempt is *reserved before* the passphrase is compared, and a
// correct passphrase clears the whole bucket. So the budget spends only
// on guesses that go nowhere, and an owner who fumbles a few times and
// then gets it right walks away with a clean slate.
//
// Reserving up front rather than counting failures afterwards is the
// whole point: a check that only reads, and increments later, admits
// every request in a concurrent batch before any of them has counted.
// That turns "8 tries per window" into "8 tries per window, or as many
// as you can send at once" — which is no limit at all against the one
// attacker this exists to stop.
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
// Redis path
// ---------------------------------------------------------------------------

// Increment and read the remaining window in one atomic step.
//
// Two things have to be atomic here, and a sequence of client calls gives
// neither:
//
//  - Admission. INCR returns this caller's own position in the window, so
//    concurrent callers get 1, 2, 3... and each is judged against its own
//    number. No two requests can both see "under the limit" for the same
//    slot.
//  - The expiry. INCR creates a missing key with no TTL. If a separate
//    EXPIRE were to fail, the key would persist forever; the count would
//    sit at or above the limit; and because admission is decided before
//    the passphrase is compared, even the correct passphrase could never
//    reach the code that clears it. That address would be locked out
//    permanently. Setting the expiry inside the script removes the gap,
//    and the `t < 0` branch also repairs any key that somehow lost one.
const RESERVE_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

// ---------------------------------------------------------------------------
// In-memory limiter
// ---------------------------------------------------------------------------

// Runs on every request, whether or not Redis is configured — see
// reserveAttempt for why it isn't skipped when Redis is healthy.
//
// On its own (no KV store) it is per-instance and leaky by nature:
// serverless instances are ephemeral and several can be warm at once, so
// an attacker who lands on fresh instances gets more attempts than the
// nominal limit. It is still far better than no limit, and it degrades
// toward "slower attacker" rather than "locked-out owner".
//
// No check-then-act race here: JavaScript runs one of these to completion
// before starting the next, so read-modify-write within a single call is
// indivisible.
// `unbacked` marks an entry holding attempts Redis never saw, because a
// Redis call failed while this window was open. It is what lets a shared
// count of 1 be read correctly: with the flag clear it means the window
// genuinely rolled over, with it set it can equally mean Redis lost the
// tally while it was down. Those two need opposite handling and are
// otherwise indistinguishable.
type MemoryEntry = { count: number; expiresAtMs: number; unbacked: boolean };
const memory = new Map<string, MemoryEntry>();

// Bounded so a stream of distinct source addresses can't grow the map
// without limit — that would turn a brute-force defense into a memory
// exhaustion vector.
const MEMORY_MAX_ENTRIES = 5000;

// Introspection for tests, so the MEMORY_MAX_ENTRIES bound above can be
// asserted rather than argued. Returns a count, never any key material,
// and is not reachable over HTTP.
export function memoryEntryCount(): number {
  return memory.size;
}

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

function memoryReserve(key: string, limit: number, windowSeconds: number, nowMs: number): RateLimitVerdict {
  const entry = memory.get(key);
  if (!entry || entry.expiresAtMs <= nowMs) {
    memoryPrune(nowMs);
    // Fixed window anchored at the first attempt — later attempts inside
    // the window raise the count but never extend it, so an attacker
    // cannot stretch a lockout the owner might be sharing an IP with.
    memory.set(key, { count: 1, expiresAtMs: nowMs + windowSeconds * 1000, unbacked: false });
    return { allowed: true };
  }
  entry.count += 1;
  if (entry.count <= limit) return { allowed: true };
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.expiresAtMs - nowMs) / 1000)) };
}

// Bring this instance's entry into line with the shared window, and return
// the count to judge against.
//
// The two windows do not start at the same moment: a warm instance can
// have opened its local window long after (or before) Redis opened the
// shared one. Left alone, a local window that outlives the shared one goes
// on rejecting after Redis has rolled over — including rejecting the
// correct passphrase, and handing a caller who already waited out Redis's
// Retry-After a fresh, longer 429. Redis owns the window boundary, so
// adopt it on every successful call.
function memoryReconcile(key: string, redisCount: number, ttlSeconds: number, nowMs: number): number {
  const expiresAtMs = nowMs + ttlSeconds * 1000;
  const entry = memory.get(key);
  // A Redis count of 1 means the shared window was created by this very
  // request. That happens two ways, and they need opposite treatment:
  //
  //  - The old window expired, or another instance cleared the bucket on a
  //    correct passphrase. Any local entry belongs to a window that is over
  //    and carrying its count forward would extend a lockout past the end
  //    of the window that justified it.
  //  - Redis was down and lost the tally. Those attempts still happened.
  //    Resetting here would hand a guesser a fresh budget every time the
  //    store flapped, which is the whole reason the local entry is kept.
  //
  // `unbacked` is the only thing that tells them apart.
  if (!entry || (redisCount === 1 && !entry.unbacked)) {
    memory.set(key, { count: redisCount, expiresAtMs, unbacked: false });
    return redisCount;
  }
  // Mid-window: keep whichever count is higher. Redis is normally ahead,
  // since it sees every instance; local is ahead only where Redis dropped
  // writes during a flap, and that excess is exactly what must not be
  // handed back on recovery.
  entry.count = Math.max(entry.count, redisCount);
  entry.expiresAtMs = expiresAtMs;
  return entry.count;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Consume one attempt from this caller's budget and say whether it may
// proceed. Call this *before* comparing the passphrase — a throttled
// request must not reach the comparison at all.
export async function reserveAttempt(
  bucket: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitVerdict> {
  const key = PREFIX + bucket;

  // Reserve in memory unconditionally, even with Redis healthy. If Redis
  // then flaps, the fallback continues from an accurate count instead of
  // restarting at zero — otherwise an intermittent store hands budget
  // back on every recovery, and a slow attacker gets a fresh eight each
  // time a write fails and a read succeeds.
  const memoryVerdict = memoryReserve(key, limit, windowSeconds, Date.now());

  const redis = getRedis();
  if (redis) {
    try {
      const [count, ttl] = await redis.eval<string[], [number, number]>(
        RESERVE_SCRIPT,
        [key],
        [String(windowSeconds)]
      );
      // TTL is whole seconds, so 0 means "expires within this second".
      // Treat that as a one-second wait rather than rounding it up to a
      // full window and telling the caller to come back in 15 minutes.
      const retryAfterSeconds = Math.max(1, ttl);
      // Redis owns both the count and the window. Reconciling folds any
      // flap-era excess this instance is holding into the shared window
      // instead of letting a stale local window outlive it in either
      // direction — too strict or too lenient.
      const effectiveCount = memoryReconcile(key, count, retryAfterSeconds, Date.now());
      if (effectiveCount > limit) return { allowed: false, retryAfterSeconds };
      return { allowed: true };
    } catch {
      // Store unreachable. Fall through to the memory verdict rather than
      // 500ing the owner out of their own connector flow — the attempt is
      // already counted there, and the passphrase check still applies.
      //
      // Mark the window: this attempt is one Redis has no record of, so
      // when the store comes back and reports a fresh count of 1, that
      // must not be mistaken for a window that legitimately rolled over.
      const entry = memory.get(key);
      if (entry) entry.unbacked = true;
    }
  }

  return memoryVerdict;
}

// Call after a correct passphrase, so the attempts that led there are
// forgiven and a few mistypes never carry into a lockout later.
export async function clearAttempts(bucket: string): Promise<void> {
  const key = PREFIX + bucket;
  memory.delete(key);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(key);
    } catch {
      // Non-fatal: the bucket expires on its own.
    }
  }
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
