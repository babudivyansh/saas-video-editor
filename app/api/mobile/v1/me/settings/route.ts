import type { NextRequest } from "next/server";
import { accountSettingsPatch } from "@clipiro/shared";
import { PATCH as webProfile } from "@/app/api/auth/profile/route";
import { PATCH as webPrefs } from "@/app/api/notification-preferences/route";
import { buildSettings } from "@/lib/mobile/account";
import { callWeb, mobileError, mobileJson, parseBody, webError, withMobileAuth } from "@/lib/mobile/http";

// The settings the server keeps: language and the weekly-summary and
// product-news emails. Everything else in the app's Settings stays on the phone.

// GET /api/mobile/v1/me/settings
export const GET = withMobileAuth(async (_req: NextRequest, auth) => {
  const s = await buildSettings(auth.userId);
  return s ? mobileJson(s) : mobileError(404, "Account not found");
});

// PATCH /api/mobile/v1/me/settings { language?, email?: { weeklySummary?, productUpdates? } }
// → the settings. Wraps the web's profile and notification-preferences routes.
export const PATCH = withMobileAuth(async (req: NextRequest, auth) => {
  const body = await parseBody(req, accountSettingsPatch);
  if (!body.ok) return body.res;
  const { language, email } = body.data;
  if (language) {
    const r = await callWeb(webProfile, req, { preferredLanguage: language }, "PATCH");
    if (r.status >= 400) return webError(r);
  }
  if (email && Object.keys(email).length) {
    const r = await callWeb(webPrefs, req, email, "PATCH");
    if (r.status >= 400) return webError(r);
  }
  return mobileJson(await buildSettings(auth.userId));
});
