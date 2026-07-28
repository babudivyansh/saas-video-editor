import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// POST /api/reviews/testimonial-impression — anonymous, aggregate-only
// engagement beacon for the landing page's testimonial section. No auth, no
// cookies, no per-visitor identity: a single daily counter row, fired once
// per page-load by TestimonialMarquee's IntersectionObserver. Rate-limited
// by IP since it's unauthenticated and reachable by anyone.
async function handlePOST() {
  await prisma.testimonialImpression.upsert({
    where: { date: todayKey() },
    create: { date: todayKey(), count: 1 },
    update: { count: { increment: 1 } },
  });
  return NextResponse.json({ ok: true });
}

export const POST = withRateLimit(handlePOST, { limit: 30, windowSec: 60, keyBy: "ip", name: "reviews:testimonial-impression" });
