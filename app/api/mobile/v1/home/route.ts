import type { NextRequest } from "next/server";
import { buildHomeSummary } from "@/lib/mobile/account";
import { mobileError, mobileJson, withMobileAuth } from "@/lib/mobile/http";
import { withRateLimit } from "@/lib/with-rate-limit";

// GET /api/mobile/v1/home → the Home tab: balances, best clips, active and
// rendering projects, level, unread notifications.
export const GET = withRateLimit(
  withMobileAuth(async (_req: NextRequest, auth) => {
    const summary = await buildHomeSummary(auth.userId);
    return summary ? mobileJson(summary) : mobileError(404, "Account not found");
  }),
  { limit: 120, windowSec: 60, keyBy: "user", name: "mobile:home" },
);
