import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getAuthUser, invalidateAllSessions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendTwoFactorChangedAlertEmail } from "@/lib/email";
import { withRateLimit } from "@/lib/with-rate-limit";
import { logger } from "@/lib/logger";

// POST /api/auth/2fa/disable { password } — password-confirmed, same
// step-up pattern as setup. Deliberately does NOT also require a TOTP code:
// losing the authenticator device is exactly the scenario this needs to
// recover from, and recovery codes are a separate, optional fallback, not a
// hard requirement to turn 2FA off.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { password } = await req.json().catch(() => ({}));
  if (!password || typeof password !== "string") {
    return NextResponse.json({ error: "Enter your password to continue" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: auth.userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Incorrect password" }, { status: 400 });

  await prisma.$transaction([
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId: auth.userId } }),
    prisma.user.update({
      where: { id: auth.userId },
      data: { twoFactorEnabled: false, twoFactorSecretEnc: null, twoFactorLastUsedStep: null },
    }),
  ]);

  // Removing the account's strongest control shouldn't leave any other device
  // holding a session that outlived it. Same keep-this-device shape as
  // change-password: whoever just re-typed the password stays signed in.
  await invalidateAllSessions(auth.userId, auth.sessionId).catch(() => {});

  const timeStr = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  sendTwoFactorChangedAlertEmail(user.email, user.firstName ?? user.name ?? "", false, timeStr)
    .catch((e) => logger.error("2fa-disable", "alert email error", e));

  return NextResponse.json({ ok: true });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 900, keyBy: "user", name: "2fa:disable" });
