import type { NextRequest } from "next/server";
import { updateProfileRequest } from "@clipiro/shared";
import { PATCH as webProfile } from "@/app/api/auth/profile/route";
import { buildAccount } from "@/lib/mobile/account";
import { callWeb, mobileError, mobileJson, parseBody, webError, withMobileAuth } from "@/lib/mobile/http";
import { withRateLimit } from "@/lib/with-rate-limit";

// GET /api/mobile/v1/me → the You tab: profile, plan, level, balances, unread
// notifications, signed-in devices, referral share.
export const GET = withRateLimit(
  withMobileAuth(async (_req: NextRequest, auth) => {
    const account = await buildAccount(auth.userId);
    return account ? mobileJson(account) : mobileError(404, "Account not found");
  }),
  { limit: 120, windowSec: 60, keyBy: "user", name: "mobile:me" },
);

// PATCH /api/mobile/v1/me { name } → the updated account. Wraps the web's
// profile route (its name rules and rate limit).
export const PATCH = withMobileAuth(async (req: NextRequest, auth) => {
  const body = await parseBody(req, updateProfileRequest);
  if (!body.ok) return body.res;
  const result = await callWeb(webProfile, req, { name: body.data.name }, "PATCH");
  if (result.status >= 400) return webError(result);
  return mobileJson(await buildAccount(auth.userId));
});
