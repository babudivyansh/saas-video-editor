import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyStepUp } from "@/lib/step-up";
import { withRateLimit } from "@/lib/with-rate-limit";
import { generateRecoveryCode, hashRecoveryCode } from "@/lib/totp";

const RECOVERY_CODE_COUNT = 10;

// POST /api/auth/2fa/recovery-codes { password } — issues a fresh set and
// invalidates the old one. Password-confirmed, the same step-up as setup and
// disable. Exists because the alternative was disabling and re-enabling 2FA
// just to get new codes, which drops the account's protection entirely (and
// forces a re-scan) in the middle of a routine hygiene action.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const user = await prisma.user.findUnique({ where: { id: auth.userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  // Password, or an emailed code for accounts without one (lib/step-up.ts).
  const stepUp = await verifyStepUp(user, body);
  if (!stepUp.ok) return NextResponse.json({ error: stepUp.error }, { status: 400 });

  if (!user.twoFactorEnabled) {
    return NextResponse.json({ error: "Two-factor authentication is not enabled" }, { status: 409 });
  }

  const plainCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());

  await prisma.$transaction(async (tx) => {
    await tx.twoFactorRecoveryCode.deleteMany({ where: { userId: auth.userId } });
    await tx.twoFactorRecoveryCode.createMany({
      data: plainCodes.map((c) => ({ userId: auth.userId, codeHash: hashRecoveryCode(c) })),
    });
  });

  return NextResponse.json({ ok: true, recoveryCodes: plainCodes });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 900, keyBy: "user", name: "2fa:recovery-codes" });
