import type { NextRequest } from "next/server";
import { buildContent, ownedAccount, rangeAndTz } from "@/lib/mobile/social";
import { mobileError, mobileJson, withMobileSubscriber } from "@/lib/mobile/http";
import { withRateLimit } from "@/lib/with-rate-limit";

// GET /api/mobile/v1/social/content?range=30&accountId=&tz= → posts in the
// range (newest 200), average views and watch %, and the best posting block.
export const GET = withRateLimit(
  withMobileSubscriber(async (req: NextRequest, auth) => {
    const q = rangeAndTz(req);
    if (!q.ok) return mobileError(400, q.error, { code: "invalid_request" });
    const accountId = req.nextUrl.searchParams.get("accountId");
    if (accountId && !(await ownedAccount(auth.userId, accountId))) return mobileError(404, "Account not found");
    return mobileJson(await buildContent(auth.userId, q.range, q.tz, accountId));
  }),
  { limit: 60, windowSec: 60, keyBy: "user", name: "mobile:social:content" },
);
