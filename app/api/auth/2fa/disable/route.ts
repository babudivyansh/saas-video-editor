import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, invalidateAllSessions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyStepUp } from "@/lib/step-up";
import { verifyStepUpSecondFactor } from "@/lib/two-factor-verify";
import { sendTwoFactorChangedAlertEmail } from "@/lib/email";
import { withRateLimit } from "@/lib/with-rate-limit";
import { logger } from "@/lib/logger";
import { greetingName } from "@/lib/display-name";

// POST /api/auth/2fa/disable { password, twoFactorCode } — password-confirmed
// (same step-up as setup) AND a code from the authenticator. Password alone
// used to be enough, so a hijacked session plus a phished password could
// strip the second factor. A recovery code also counts, which covers the
// owner who lost the authenticator device; failures count toward the
// per-account 2FA lockout (lib/two-factor-verify.ts).
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const user = await prisma.user.findUnique({ where: { id: auth.userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  // Password, or an emailed code for accounts without one (lib/step-up.ts).
  const stepUp = await verifyStepUp(user, body);
  if (!stepUp.ok) return NextResponse.json({ error: stepUp.error }, { status: 400 });
  const second = await verifyStepUpSecondFactor(user, body.twoFactorCode);
  if (!second.ok) return NextResponse.json({ error: second.error, twoFactorRequired: true }, { status: second.status });

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
  sendTwoFactorChangedAlertEmail(user.email, greetingName(user.name), false, timeStr)
    .catch((e) => logger.error("2fa-disable", "alert email error", e));

  return NextResponse.json({ ok: true });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 900, keyBy: "user", name: "2fa:disable" });
