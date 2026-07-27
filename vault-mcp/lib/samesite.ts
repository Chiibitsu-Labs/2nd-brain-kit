// True when a POST demonstrably came from another site.
//
// Client registration is public, so an attacker can hold valid OAuth fields
// and put auto-submitting forms on a page. Before the throttle existed that
// bought them nothing — the passphrase still had to be right. The throttle
// turned it into a weapon: eight hidden cross-origin submissions from a page
// the owner merely visits will spend the owner's own budget and keep them
// from authorizing, repeatable every window. A rate limit that an attacker
// can aim at the victim is worse than no rate limit, so cross-site posts are
// refused before anything is reserved.
//
// Deliberately evidence-based, never guessing. Sec-Fetch-Site is set by the
// browser and cannot be forged from script; Origin is sent on every POST by
// every browser that matters. Absent both, the request is treated as
// same-site — a curl or a legacy client should not be locked out over a
// header it never sends, and neither can mount this attack, which needs a
// browser to carry the victim's address.
export function isCrossSitePost(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return true;

  const origin = req.headers.get("origin");
  if (!origin) return false;
  // Behind Vercel's proxy the forwarded host is the public one; Host alone
  // can be the internal address and would never match a real Origin.
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true; // unparseable Origin is not something to give benefit of doubt
  }
}
