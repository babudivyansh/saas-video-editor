import type { NextRequest } from "next/server";
import { POST as webSend } from "@/app/api/auth/step-up/send/route";
import { callWeb, mobileJson, webError, withMobileAuth } from "@/lib/mobile/http";

// POST /api/mobile/v1/me/step-up-code → { ok }. Emails a code that confirms a
// sensitive step (delete account) on an account with no password. Wraps the
// web route (3 per 15 minutes).
export const POST = withMobileAuth(async (req: NextRequest) => {
  const r = await callWeb(webSend, req, {});
  if (r.status >= 400) return webError(r);
  const { devCode } = r.json;
  return mobileJson({ ok: true, ...(typeof devCode === "string" ? { devCode } : {}) });
});
