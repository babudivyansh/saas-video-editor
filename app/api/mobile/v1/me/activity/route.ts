import type { NextRequest } from "next/server";
import { buildActivity } from "@/lib/mobile/account";
import { mobileJson, withMobileAuth } from "@/lib/mobile/http";
import { withRateLimit } from "@/lib/with-rate-limit";

// GET /api/mobile/v1/me/activity?cursor= → { items, nextCursor }: credit and
// Clip Minute spends and grants, newest first, in plain words.
export const GET = withRateLimit(
  withMobileAuth(async (req: NextRequest, auth) => mobileJson(await buildActivity(auth.userId, req.nextUrl.searchParams.get("cursor")))),
  { limit: 60, windowSec: 60, keyBy: "user", name: "mobile:activity" },
);
