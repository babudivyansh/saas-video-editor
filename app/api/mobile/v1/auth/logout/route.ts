import type { NextRequest } from "next/server";
import { logoutRequest } from "@clipiro/shared";
import { getAuthUser, invalidateOneSession, revokeMobileSession } from "@/lib/auth";
import { mobileJson, parseBody } from "@/lib/mobile/http";
import { prisma } from "@/lib/prisma";

// POST /api/mobile/v1/auth/logout { refreshToken? } with the access token as
// Bearer → { ok }. Either credential ends this device's session, so logging
// out still works when the access token has already expired. Always ok:
// a session that is already gone is logged out.
//
// The phone's push tokens go with the session (DeviceToken.sessionId), so a
// signed-out phone never receives another account's notifications.
export async function POST(req: NextRequest) {
  const body = await parseBody(req, logoutRequest);
  if (!body.ok) return body.res;

  const ended: { userId: string; sessionId: string }[] = [];
  if (body.data.refreshToken) {
    const ids = await revokeMobileSession(body.data.refreshToken);
    if (ids) ended.push(ids);
  }
  const auth = await getAuthUser(req);
  if (auth) {
    await invalidateOneSession(auth.userId, auth.sessionId);
    ended.push({ userId: auth.userId, sessionId: auth.sessionId });
  }
  if (ended.length) {
    await prisma.deviceToken.deleteMany({ where: { OR: ended.map(({ userId, sessionId }) => ({ userId, sessionId })) } });
  }
  return mobileJson({ ok: true });
}
