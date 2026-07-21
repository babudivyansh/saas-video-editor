import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { sendTwoFactorChangedAlertEmail } from "@/lib/email";
import { withRateLimit } from "@/lib/with-rate-limit";
import { encryptSecret, decryptSecret } from "@/lib/encryption";
import { verifyTotpStep, generateRecoveryCode, hashRecoveryCode } from "@/lib/totp";
import { logger } from "@/lib/logger";

const RECOVERY_CODE_COUNT = 10;

// POST /api/auth/2fa/enable { code } — confirms the pending secret from
// /api/auth/2fa/setup with a real TOTP code before anything is persisted,
// then issues one-time recovery codes (shown exactly once, like an API key's
// plaintext).
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await req.json().catch(() => ({}));
  if (typeof code !== "string") return NextResponse.json({ error: "code is required" }, { status: 400 });

  const pendingEnc = await redis.get(`2fa-setup:${auth.userId}`);
  if (!pendingEnc) {
    return NextResponse.json({ error: "Setup expired — start again." }, { status: 400 });
  }
  const secret = decryptSecret(pendingEnc);

  const step = verifyTotpStep(secret, code);
  if (step === null) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const plainCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());

  await prisma.$transaction(async (tx) => {
    await tx.twoFactorRecoveryCode.deleteMany({ where: { userId: auth.userId } }); // clear any stale set from a prior enable/disable cycle
    await tx.twoFactorRecoveryCode.createMany({
      data: plainCodes.map((c) => ({ userId: auth.userId, codeHash: hashRecoveryCode(c) })),
    });
    await tx.user.update({
      where: { id: auth.userId },
      // Seeding twoFactorLastUsedStep with the enrollment code's own step
      // closes the window where that same code — just typed, possibly still on
      // screen — would also work as the first login's second factor.
      data: { twoFactorEnabled: true, twoFactorSecretEnc: encryptSecret(secret), twoFactorLastUsedStep: step },
    });
  });

  await redis.del(`2fa-setup:${auth.userId}`);

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { email: true, firstName: true, name: true },
  });
  if (user) {
    const timeStr = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
    sendTwoFactorChangedAlertEmail(user.email, user.firstName ?? user.name ?? "", true, timeStr)
      .catch((e) => logger.error("2fa-enable", "alert email error", e));
  }

  return NextResponse.json({ ok: true, recoveryCodes: plainCodes });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 900, keyBy: "user", name: "2fa:enable" });
