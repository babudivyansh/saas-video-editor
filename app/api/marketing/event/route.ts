import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { recordMarketingEvent } from "@/lib/marketing-analytics";
import { withRateLimit } from "@/lib/with-rate-limit";

/**
 * UTM values arrive from the query string, i.e. from anyone. Per-IP rate
 * limiting does not stop a distributed bot from minting unbounded distinct
 * rows in a table whose primary purpose is a unique index over these columns,
 * so anything that isn't a short, boring token collapses to the literal
 * "other" — one extra row, not a million.
 */
const utm = z
  .string()
  .max(32)
  .regex(/^[a-z0-9_-]*$/)
  .catch("other")
  .default("");

const bodySchema = z
  .object({
    event: z.enum(["cta_click", "newsletter_submit"]),
    // Same-origin app path only. Rejecting absolute URLs keeps a full URL with
    // a query string (which can carry PII) out of an aggregate table.
    path: z
      .string()
      .max(256)
      .regex(/^\/[^?#\s]*$/),
    placement: z.enum(["listing", "article_hero", "mid_article", "article_footer", "newsletter"]),
    utmSource: utm,
    utmMedium: utm,
    utmCampaign: utm,
  })
  .strict();

// POST /api/marketing/event — anonymous, aggregate-only first-party beacon for
// public marketing surfaces (blog CTAs today). No auth, no cookies, no
// per-visitor identity; the client suppresses the call entirely when marketing
// consent is denied. Rate-limited by IP since it's unauthenticated.
async function handlePOST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { event, path, placement, utmSource, utmMedium, utmCampaign } = parsed.data;
  await recordMarketingEvent(event, {
    path,
    placement,
    utm: { source: utmSource, medium: utmMedium, campaign: utmCampaign },
  });

  return NextResponse.json({ ok: true });
}

export const POST = withRateLimit(handlePOST, {
  limit: 30,
  windowSec: 60,
  keyBy: "ip",
  name: "marketing:event",
});
