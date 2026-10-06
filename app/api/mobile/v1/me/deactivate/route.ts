import type { NextRequest } from "next/server";
import { deactivateRequest } from "@clipiro/shared";
import { POST as webDeactivate } from "@/app/api/account/deactivate/route";
import { callWeb, mobileJson, parseBody, webError, withMobileAuth } from "@/lib/mobile/http";

// POST /api/mobile/v1/me/deactivate { password } or { otp } → { ok, purgeAt }.
// Switches the account off and ends every session; it's deleted for good
// after 30 days unless the user signs back in (reactivate). Accounts with no
// password confirm with the code from POST /me/step-up-code. Wraps the web
// route, which also cancels a running subscription.
export const POST = withMobileAuth(async (req: NextRequest) => {
  const body = await parseBody(req, deactivateRequest);
  if (!body.ok) return body.res;
  const r = await callWeb(webDeactivate, req, body.data);
  if (r.status >= 400) return webError(r);
  return mobileJson({ ok: true, purgeAt: r.json.purgeAt ?? null });
});
