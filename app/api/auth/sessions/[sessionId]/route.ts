import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, invalidateOneSession } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";

// DELETE /api/auth/sessions/{sessionId} — sign out one specific device.
// Inherently ownership-scoped: invalidateOneSession only ever touches the
// caller's own session list (auth.userId), never anyone else's — there's no
// way to pass another user's id through this route at all.
async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId } = await params;
  await invalidateOneSession(auth.userId, sessionId);
  return NextResponse.json({ ok: true });
}

export const DELETE = withRateLimit(handleDELETE, { limit: 20, windowSec: 60, keyBy: "user", name: "sessions:delete-one" });
