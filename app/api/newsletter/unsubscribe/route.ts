import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";

// GET /api/newsletter/unsubscribe?t=<token> — same token as the confirmation
// link, so every newsletter email can carry a one-click opt-out.
//
// Redirects identically whether or not the token resolves, for the same
// enumeration reason as the confirm route. Unsubscribing twice is a no-op.
async function handleGET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("t");
  const done = NextResponse.redirect(new URL("/newsletter/unsubscribed", env.NEXT_PUBLIC_APP_URL));

  if (!token) return done;

  const subscriber = await prisma.newsletterSubscriber.findUnique({
    where: { token },
    select: { status: true },
  });
  if (!subscriber || subscriber.status === "unsubscribed") return done;

  await prisma.newsletterSubscriber.update({
    where: { token },
    data: { status: "unsubscribed", unsubscribedAt: new Date() },
  });

  return done;
}

export const GET = withRateLimit(handleGET, {
  limit: 20,
  windowSec: 300,
  keyBy: "ip",
  name: "newsletter:unsubscribe",
});
