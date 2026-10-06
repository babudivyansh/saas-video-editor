import type { NextRequest } from "next/server";
import { buildOverview, rangeAndTz } from "@/lib/mobile/social";
import { mobileError, mobileJson, withMobileSubscriber } from "@/lib/mobile/http";
import { withRateLimit } from "@/lib/with-rate-limit";

// GET /api/mobile/v1/social/overview?range=30&tz=Asia/Kolkata → Insights:
// views, followers, engagement and posts across every account (the web
// overview's own roll-up), daily views, follower share by platform, top post.
export const GET = withRateLimit(
  withMobileSubscriber(async (req: NextRequest, auth) => {
    const q = rangeAndTz(req);
    if (!q.ok) return mobileError(400, q.error, { code: "invalid_request" });
    return mobileJson(await buildOverview(auth.userId, q.range, q.tz));
  }),
  { limit: 60, windowSec: 60, keyBy: "user", name: "mobile:social:overview" },
);
