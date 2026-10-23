import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/with-rate-limit";
import { logger } from "@/lib/logger";

// POST /api/csp-report — the report-uri target for the Content-Security-Policy
// header built in lib/csp.ts. Browsers POST a violation report here whenever
// something on the page was blocked; logging them is how a third-party origin
// missing from the (now enforcing) policy shows up instead of a silently
// broken feature. Public and unauthenticated by nature (any
// visitor's browser can send one, logged in or not) — rate-limited by IP so a
// hostile client can't use it to flood logs.
async function handlePOST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (body) logger.warn("csp-report", "violation reported", body);
  return new NextResponse(null, { status: 204 });
}

export const POST = withRateLimit(handlePOST, { limit: 30, windowSec: 60, keyBy: "ip", name: "csp-report" });
