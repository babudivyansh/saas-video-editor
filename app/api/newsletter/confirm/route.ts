import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { recordMarketingEvent } from "@/lib/marketing-analytics";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";

// GET /api/newsletter/confirm?t=<token> — completes double opt-in.
//
// Always redirects to the same page, token valid or not: a distinguishable
// error response would let someone probe which tokens exist. Replaying a
// already-used token is a no-op with an identical redirect.
//
// Known tradeoff: corporate link scanners prefetch GET links and will
// auto-confirm some subscribers, which inflates the confirm rate. The
// alternative is an interstitial page with a POST form; the industry norm is to
// accept this and treat the number as soft.
async function handleGET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("t");
  const done = NextResponse.redirect(new URL("/newsletter/confirmed", env.NEXT_PUBLIC_APP_URL));

  if (!token) return done;

  const subscriber = await prisma.newsletterSubscriber.findUnique({
    where: { token },
    select: { email: true, status: true },
  });
  if (!subscriber || subscriber.status === "confirmed") return done;

  await prisma.newsletterSubscriber.update({
    where: { token },
    data: { status: "confirmed", confirmedAt: new Date(), unsubscribedAt: null },
  });

  await recordMarketingEvent("newsletter_confirmed", { path: "/blog", placement: "newsletter" });

  return done;
}

export const GET = withRateLimit(handleGET, {
  limit: 20,
  windowSec: 300,
  keyBy: "ip",
  name: "newsletter:confirm",
});
