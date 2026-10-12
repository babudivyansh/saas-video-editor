import type { NextRequest } from "next/server";
import { registerDeviceRequest, unregisterDeviceRequest } from "@clipiro/shared";
import { mobileJson, parseBody, withMobileAuth } from "@/lib/mobile/http";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";

// Phones registered for push notifications (lib/push.ts sends to them).

// POST /api/mobile/v1/devices { token, provider, deviceName?, appVersion?, prefs? } → { ok }.
// Call after sign-in, whenever the push token changes, and when the phone's
// push switches change (prefs). A token is one
// phone: if another account registered it (the phone changed hands), it
// moves to this one. Tied to this session, so logging out removes it.
export const POST = withRateLimit(
  withMobileAuth(async (req: NextRequest, auth) => {
    const body = await parseBody(req, registerDeviceRequest);
    if (!body.ok) return body.res;
    const { token, provider, deviceName, appVersion, prefs } = body.data;
    const data = { userId: auth.userId, provider, sessionId: auth.sessionId, deviceName: deviceName ?? null, appVersion: appVersion ?? null, lastSeenAt: new Date(), ...(prefs ? { pushPrefs: prefs } : {}) };
    await prisma.deviceToken.upsert({ where: { token }, create: { token, ...data }, update: data });
    return mobileJson({ ok: true });
  }),
  { limit: 30, windowSec: 3600, keyBy: "user", name: "mobile:devices" },
);

// DELETE /api/mobile/v1/devices { token } → { ok }: stop pushes to this phone.
// Only the caller's own token is removed; an unknown one is already gone.
export const DELETE = withMobileAuth(async (req: NextRequest, auth) => {
  const body = await parseBody(req, unregisterDeviceRequest);
  if (!body.ok) return body.res;
  await prisma.deviceToken.deleteMany({ where: { token: body.data.token, userId: auth.userId } });
  return mobileJson({ ok: true });
});
