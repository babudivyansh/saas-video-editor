import type { NextRequest } from "next/server";
import { buildAnalyticsOverview, rangeAndTz } from "@/lib/mobile/social";
import { mobileError, mobileJson, withMobileSubscriber } from "@/lib/mobile/http";
import { withRateLimit } from "@/lib/with-rate-limit";

// GET /api/mobile/v1/social/analytics?range=&tz= → Account analytics: total
// followers (and gained), follower growth, views, engagement, interactions,
// the biggest platform's share, and the average account health score.
export const GET = withRateLimit(
  withMobileSubscriber(async (req: NextRequest, auth) => {
    const q = rangeAndTz(req);
    if (!q.ok) return mobileError(400, q.error, { code: "invalid_request" });
    return mobileJson(await buildAnalyticsOverview(auth.userId, q.range, q.tz));
  }),
  { limit: 60, windowSec: 60, keyBy: "user", name: "mobile:social:analytics" },
);
