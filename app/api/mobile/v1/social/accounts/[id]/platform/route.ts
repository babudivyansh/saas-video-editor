import type { NextRequest } from "next/server";
import { buildPlatform, ownedAccount, rangeAndTz } from "@/lib/mobile/social";
import { mobileError, mobileJson, withMobileSubscriber } from "@/lib/mobile/http";
import { withRateLimit } from "@/lib/with-rate-limit";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/mobile/v1/social/accounts/:id/platform?range=&tz= → one account's
// KPIs, follower growth, and its audience by age and country.
export const GET = withRateLimit(
  withMobileSubscriber(async (req: NextRequest, auth, { params }: Ctx) => {
    const q = rangeAndTz(req);
    if (!q.ok) return mobileError(400, q.error, { code: "invalid_request" });
    const account = await ownedAccount(auth.userId, (await params).id);
    if (!account) return mobileError(404, "Account not found");
    return mobileJson(await buildPlatform(account, q.range, q.tz));
  }),
  { limit: 60, windowSec: 60, keyBy: "user", name: "mobile:social:platform" },
);
