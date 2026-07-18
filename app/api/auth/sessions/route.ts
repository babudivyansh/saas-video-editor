import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, listSessions, invalidateAllSessions } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";

async function handleGET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessions = await listSessions(auth.userId);
  return NextResponse.json({
    sessions: sessions.map((s) => ({ ...s, isCurrent: s.sessionId === auth.sessionId })),
  });
}

// DELETE (no id) — sign out every OTHER device, keep this one. Matches
// change-password's own "kill everything except the current session" behavior.
async function handleDELETE(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await invalidateAllSessions(auth.userId, auth.sessionId);
  return NextResponse.json({ ok: true });
}

export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "user", name: "sessions:list" });
export const DELETE = withRateLimit(handleDELETE, { limit: 10, windowSec: 60, keyBy: "user", name: "sessions:delete-all" });
