import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getReviewSummary } from "@/lib/reviews/queries";

async function handleGET(_req: NextRequest) {
  const summary = await getReviewSummary();
  return NextResponse.json({ summary });
}

export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "ip", name: "reviews:summary" });
