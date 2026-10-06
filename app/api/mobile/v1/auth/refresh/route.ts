import type { NextRequest } from "next/server";
import { refreshRequest } from "@clipiro/shared";
import { refreshMobileSession } from "@/lib/auth";
import { mobileError, mobileJson, parseBody } from "@/lib/mobile/http";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

// POST /api/mobile/v1/auth/refresh { refreshToken } → { accessToken, refreshToken, expiresIn }.
// Each refresh token works once. A 401 means sign in again; code
// "refresh_reused" means an old token came back, so the session was ended.
export async function POST(req: NextRequest) {
  const limit = await rateLimit(`mobile-refresh:ip:${getClientIp(req)}`, 120, 900);
  if (!limit.allowed) return mobileError(429, "Too many requests. Please try again later.");

  const body = await parseBody(req, refreshRequest);
  if (!body.ok) return body.res;

  const result = await refreshMobileSession(body.data.refreshToken);
  if (!result.ok) {
    return mobileError(401, "Your session has ended. Please sign in again.", { code: result.reason === "reused" ? "refresh_reused" : "refresh_invalid" });
  }
  return mobileJson(result.tokens);
}
