import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getPublishedReviewById } from "@/lib/reviews/queries";

async function handleGET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const review = await getPublishedReviewById(id);
  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ review });
}

export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "ip", name: "reviews:detail" });
