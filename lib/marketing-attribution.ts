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
