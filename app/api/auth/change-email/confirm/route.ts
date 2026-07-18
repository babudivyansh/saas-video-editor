import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { invalidateAllSessions } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";

interface ChangeEmailPayload {
  userId: string;
  newEmail: string;
}

// POST /api/auth/change-email/confirm { token } — intentionally
// unauthenticated (opened from an email client, possibly a device with no
// active session at all — same reasoning as verify-email/confirm).
async function handlePOST(req: NextRequest) {
  const { token } = await req.json().catch(() => ({}));
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Confirmation token is required" }, { status: 400 });
  }

  const raw = await redis.get(`change-email:${token}`);
  if (!raw) {
    return NextResponse.json({ error: "This confirmation link has expired or is invalid." }, { status: 400 });
  }
  const { userId, newEmail } = JSON.parse(raw) as ChangeEmailPayload;

  // Re-check uniqueness — the address could have been claimed by someone
  // else in the window since the change was requested.
  const taken = await prisma.user.findUnique({ where: { email: newEmail } });
  if (taken && taken.id !== userId) {
    return NextResponse.json({ error: "That email was claimed by another account in the meantime." }, { status: 409 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { email: newEmail, pendingEmail: null, emailVerifiedAt: new Date() },
  });
  await redis.del(`change-email:${token}`);

  // The email is embedded in every issued JWT's payload — every existing
  // session (including wherever the change was originally requested from)
  // now carries a stale claim, so all of them re-log in with a fresh token.
  await invalidateAllSessions(userId);

  return NextResponse.json({ ok: true });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 900, keyBy: "ip", name: "change-email:confirm" });
