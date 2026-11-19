/**
 * First-touch campaign attribution, stored in a single cookie.
 *
 * Deliberately dependency-free: proxy.ts runs on the edge runtime and imports
 * this to *write* the cookie, so nothing here may reach for Prisma, Redis, or
 * anything Node-only. The matching read/record step lives in
 * lib/marketing-analytics.ts, which is server-only.
 */

export const ATTRIBUTION_COOKIE = "mkt_attr";

export interface UtmTuple {
  source: string;
  medium: string;
  campaign: string;
}

/**
 * Same clamp the beacon route applies. UTM values are attacker-controlled, and
 * this one ends up in a cookie and then in a unique index, so anything that
 * isn't a short, boring token is dropped rather than stored.
 */
function normalize(value: string | null): string {
  if (!value) return "";
  const lowered = value.toLowerCase();
  // Rejected, not truncated. Truncating an over-length campaign name yields a
  // value that looks legitimate but silently misattributes to a mangled name,
  // and it bounds nothing — 32 chars of [a-z0-9_-] is already a vast space.
  // This also matches the beacon route's `.max(32)`, so a campaign is either
  // recorded identically on both paths or dropped on both.
  if (lowered.length > 32) return "";
  return /^[a-z0-9_-]+$/.test(lowered) ? lowered : "";
}

/**
 * Returns null when there's nothing worth remembering, so the caller can skip
 * setting a cookie at all rather than storing "||".
 */
export function buildAttributionCookie(
  source: string | null,
  medium: string | null,
  campaign: string | null,
): string | null {
  const parts = [normalize(source), normalize(medium), normalize(campaign)];
  if (parts.every((p) => p === "")) return null;
  return parts.join("|");
}

// ── First touch: where a visitor came from, for EVERY signup ────────────────
//
// mkt_attr above only exists when the landing URL carried UTM tags, which most
// traffic (search, a link in a Discord, a typed URL) doesn't — so 2026-11 the
// team couldn't tell GTA-page traffic from anything else. This second cookie
// records the referring site's host and the first path the visitor landed on,
// on the same first-touch / 30-day / consent terms, and is stored on the User
// at signup (User.signupReferrer / signupLandingPath).

export const FIRST_TOUCH_COOKIE = "first_touch";

export interface FirstTouch {
  /** Referring host without "www.", or "direct" when there was none / it was us. */
  referrer: string;
  /** First path landed on, e.g. "/gta-6-clip-maker". */
  landing: string;
}

function normalizeHost(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, "");
  return h.length <= 64 && /^[a-z0-9.-]+$/.test(h) ? h : "";
}

function normalizePath(path: string): string {
  const p = path.toLowerCase();
  return p.length <= 80 && /^\/[a-z0-9/_.-]*$/.test(p) ? p : "/";
}

/** Value for FIRST_TOUCH_COOKIE ("host|path"). `ownHost` is this site's host,
 *  so internal navigation reads as "direct" rather than as a referral. */
export function buildFirstTouchCookie(referer: string | null, ownHost: string, pathname: string): string {
  let referrer = "direct";
  if (referer) {
    try {
      const host = normalizeHost(new URL(referer).hostname);
      if (host && host !== normalizeHost(ownHost)) referrer = host;
    } catch {
      /* malformed Referer — treat as direct */
    }
  }
  return `${referrer}|${normalizePath(pathname)}`;
}

export function parseFirstTouchCookie(raw: string | null | undefined): FirstTouch | null {
  if (!raw) return null;
  const [host = "", path = ""] = raw.split("|");
  const referrer = host === "direct" ? "direct" : normalizeHost(host);
  if (!referrer) return null;
  return { referrer, landing: normalizePath(path) };
}

/**
 * Tolerant by design — a malformed or truncated cookie yields empty strings
 * rather than throwing. Attribution is best-effort metadata; it must never be
 * able to fail a registration.
 */
export function parseAttributionCookie(raw: string | null | undefined): UtmTuple | null {
  if (!raw) return null;
  const [source = "", medium = "", campaign = ""] = raw.split("|");
  const tuple = {
    source: normalize(source),
    medium: normalize(medium),
    campaign: normalize(campaign),
  };
  if (!tuple.source && !tuple.medium && !tuple.campaign) return null;
  return tuple;
}
