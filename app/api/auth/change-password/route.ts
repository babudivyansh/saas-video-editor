import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getAuthUser, invalidateAllSessions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPasswordChangedAlertEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { withRateLimit } from "@/lib/with-rate-limit";

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { currentPassword, newPassword } = await req.json();
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "currentPassword and newPassword required" }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: auth.userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const passwordChangedAt = new Date();
  await prisma.user.update({ where: { id: auth.userId }, data: { passwordHash, passwordChangedAt } });

  // Kill every OTHER active session — the device that just typed the new
  // password correctly stays signed in (matches Stripe/GitHub/Vercel; forcing
  // this tab to also re-login immediately after a successful change is bad UX).
  await invalidateAllSessions(auth.userId, auth.sessionId).catch(() => {});

  // Non-preference-gated security alert — never suppressed by notification prefs.
  const timeStr = passwordChangedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  sendPasswordChangedAlertEmail(user.email, user.firstName ?? user.name ?? "", timeStr)
    .catch((e) => logger.error("change-password", "alert email error", e));

  return NextResponse.json({ success: true });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 900, keyBy: "user", name: "auth:change-password" });
