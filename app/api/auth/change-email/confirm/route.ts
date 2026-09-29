import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { invalidateAllSessions } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { sendEmailChangedAlertEmail } from "@/lib/email";
import { greetingName } from "@/lib/display-name";
import { logger } from "@/lib/logger";

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

  // GETDEL: a link works once, even if it's opened twice at the same moment.
  const raw = await redis.getdel(`change-email:${token}`);
  if (!raw) {
    return NextResponse.json({ error: "This confirmation link has expired or is invalid." }, { status: 400 });
  }
  const { userId, newEmail } = JSON.parse(raw) as ChangeEmailPayload;

  // Only the most recent request counts. Requesting a change sets
  // pendingEmail each time, so a link from an earlier (maybe abandoned, maybe
  // not the owner's) request no longer matches and can't be used later.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, pendingEmail: true },
  });
  if (!user || user.pendingEmail !== newEmail) {
    return NextResponse.json({ error: "This confirmation link has expired or is invalid." }, { status: 400 });
  }

  // Re-check uniqueness — the address could have been claimed by someone
  // else in the window since the change was requested.
  const taken = await prisma.user.findUnique({ where: { email: newEmail } });
  if (taken && taken.id !== userId) {
    return NextResponse.json({ error: "That email was claimed by another account in the meantime." }, { status: 409 });
  }

  const changedAt = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: { email: newEmail, pendingEmail: null, emailVerifiedAt: changedAt },
  });

  // The email is embedded in every issued JWT's payload — every existing
  // session (including wherever the change was originally requested from)
  // now carries a stale claim, so all of them re-log in with a fresh token.
  await invalidateAllSessions(userId);

  // Tell the address that just lost the account. After this, password resets
  // go to the new address, so this is the previous owner's only warning.
  const timeStr = changedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  sendEmailChangedAlertEmail(user.email, greetingName(user.name), newEmail, timeStr)
    .catch((err) => logger.error("change-email:confirm", "old-address alert failed", err));

  return NextResponse.json({ ok: true });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 900, keyBy: "ip", name: "change-email:confirm" });
