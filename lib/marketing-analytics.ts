import { logger } from "./logger";
import { prisma } from "./prisma";
import { ATTRIBUTION_COOKIE, parseAttributionCookie, type UtmTuple } from "./marketing-attribution";

export type { UtmTuple };

// Marketing/acquisition events fired from public, mostly logged-out surfaces.
// Kept as one closed union for the same reason as OnboardingEvent: a new event
// has to be declared here, not invented at the call site.
export type MarketingEvent = "cta_click" | "newsletter_submit" | "newsletter_confirmed" | "marketing_signup";

// Where on the page the event originated. Closed so a typo is a type error
// rather than a new row in the aggregate table nobody ever queries.
export type MarketingPlacement =
  | "listing"
  | "article_hero"
  | "mid_article"
  | "article_footer"
  | "newsletter";

export const EMPTY_UTM: UtmTuple = { source: "", medium: "", campaign: "" };

export interface MarketingEventDims {
  path: string;
  placement: MarketingPlacement;
  utm?: UtmTuple;
}

type MarketingSink = (event: MarketingEvent, dims: MarketingEventDims) => Promise<void>;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// Default sink writes a dimensioned daily counter. This deliberately follows
// TestimonialImpression's "no cookies, no per-visitor identity" stance rather
// than ReviewPromptEvent's per-row log: these events fire for logged-out
// visitors, and a per-row log would either store nothing distinguishing or
// require minting a visitor identifier we have no consent surface for.
let sink: MarketingSink = async (event, dims) => {
  const utm = dims.utm ?? EMPTY_UTM;
  const key = {
    date: todayKey(),
    event,
    path: dims.path,
    placement: dims.placement,
    utmSource: utm.source,
    utmMedium: utm.medium,
    utmCampaign: utm.campaign,
  };
  await prisma.marketingEventDaily.upsert({
    where: { date_event_path_placement_utmSource_utmMedium_utmCampaign: key },
    create: { ...key, count: 1 },
    update: { count: { increment: 1 } },
  });
};

export function setMarketingAnalyticsSink(fn: MarketingSink): void {
  sink = fn;
}

// Never throws — a broken analytics write must not fail the signup, the
// newsletter confirmation, or the beacon it is attached to. Same convention as
// trackOnboardingEvent.
export async function recordMarketingEvent(event: MarketingEvent, dims: MarketingEventDims): Promise<void> {
  try {
    await sink(event, dims);
  } catch (err) {
    logger.error("marketing-analytics", `sink failed for ${event}`, err);
  }
}

/**
 * Closes the loop from a campaign click to an actual signup: reads the
 * first-touch cookie proxy.ts set, records the conversion, and clears the
 * cookie so a second account from the same browser isn't attributed twice.
 *
 * Mirrors how affiliate_ref is consumed at the same two call sites
 * (password registration and the Google OAuth callback). Best-effort
 * throughout — recordMarketingEvent never throws, and a missing or malformed
 * cookie is simply a no-op.
 */
export async function recordSignupAttribution(
  req: { cookies: { get(name: string): { value: string } | undefined } },
  res: { cookies: { set(name: string, value: string, opts: { maxAge: number; path: string }): unknown } },
  path: string,
): Promise<void> {
  const utm = parseAttributionCookie(req.cookies.get(ATTRIBUTION_COOKIE)?.value);
  if (!utm) return;

  await recordMarketingEvent("marketing_signup", { path, placement: "listing", utm });
  res.cookies.set(ATTRIBUTION_COOKIE, "", { maxAge: 0, path: "/" });
}
