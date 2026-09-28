import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { invalidateAllSessions } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { validatePassword } from "@/lib/auth-validation";
import { claimUnverifiedAccount } from "@/lib/account-claim";
import { sendPasswordChangedAlertEmail } from "@/lib/email";
import { greetingName } from "@/lib/display-name";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const { token, password } = await req.json().catch(() => ({}));

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Reset token is required" }, { status: 400 });
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  // Same dual keying as forgot-password: per-token (a caller who somehow has
  // a live token still can't hammer bcrypt.hash indefinitely) and per-IP (the
  // generic guard against brute-forcing tokens at all).
  const [tokenLimit, ipLimit] = await Promise.all([
    rateLimit(`pwd-reset-confirm:token:${token}`, 3, 900),
    rateLimit(`pwd-reset-confirm:ip:${getClientIp(req)}`, 10, 900),
  ]);
  if (!tokenLimit.allowed || !ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again in a few minutes." },
      { status: 429 },
    );
  }

  // Consume the token BEFORE acting on it: read-then-delete let two requests
  // racing with the same link both reset the password.
  const tokenKey = `pwd-reset:${token}`;
  const userId = await redis.get(tokenKey);
  if (!userId) {
    return NextResponse.json({ error: "This reset link has expired or is invalid. Please request a new one." }, { status: 400 });
  }
  await redis.del(tokenKey);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, emailVerifiedAt: true },
  });
  if (!user) {
    return NextResponse.json({ error: "This reset link has expired or is invalid. Please request a new one." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const passwordChangedAt = new Date();

  if (!user.emailVerifiedAt) {
    // Opening the emailed link is the first proof of this inbox. The new
    // password stays, but a second factor or sessions planted by whoever
    // registered the address first do not (lib/account-claim.ts).
    await claimUnverifiedAccount(user.id, { passwordHash });
    await prisma.user.update({ where: { id: user.id }, data: { passwordChangedAt } });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, hasPassword: true, passwordChangedAt },
    });
  }

  // A password reset implies the old password may be compromised, so every
  // device re-logs in.
  await invalidateAllSessions(user.id);

  // Non-preference-gated security alert, same as change-password.
  const timeStr = passwordChangedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  sendPasswordChangedAlertEmail(user.email, greetingName(user.name), timeStr)
    .catch((e) => logger.error("reset-password", "alert email error", e));

  return NextResponse.json({ ok: true });
}
