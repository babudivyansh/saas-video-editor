import type { MarketingPlacement } from "@/lib/marketing-analytics";

/** Client-emittable subset of MarketingEvent — the rest are server-side only. */
export type ClientMarketingEvent = "cta_click" | "newsletter_submit";

const CONSENT_COOKIE = "cookie_consent_marketing";

/**
 * Absence means allowed, matching proxy.ts's affiliate_ref capture and
 * app/cookies/CookiePreferences.tsx. Only an explicit "denied" opts out.
 */
function marketingConsentDenied(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split("; ")
    .some((c) => c === `${CONSENT_COOKIE}=denied` || c.startsWith(`${CONSENT_COOKIE}=denied;`));
}

/**
 * Fire-and-forget beacon. Never awaited, never throws, never blocks the
 * navigation it is attached to — a CTA click must not wait on analytics.
 *
 * `keepalive` rather than navigator.sendBeacon: the request has to survive the
 * page unload that a CTA click triggers, and sendBeacon would force a
 * text/plain Blob dance to send JSON. This matches the existing
 * fetch(...).catch(() => {}) shape in TestimonialMarquee.
 *
 * The payload carries no identity at all. Consent is still checked, because
 * consistency with the site's stated policy is worth more than the marginal
 * data from visitors who opted out.
 */
export function trackMarketingEvent(
  event: ClientMarketingEvent,
  dims: { path: string; placement: MarketingPlacement },
): void {
  if (marketingConsentDenied()) return;

  try {
    void fetch("/api/marketing/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, path: dims.path, placement: dims.placement }),
      keepalive: true,
    }).catch(() => {
      /* best-effort */
    });
  } catch {
    /* best-effort */
  }
}
