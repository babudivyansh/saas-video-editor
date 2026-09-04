import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionCookie, setLocaleCookieFromUser } from "@/lib/auth";
import { finishLogin } from "@/lib/login-tail";
import { decryptSecret } from "@/lib/encryption";
import { verifyTotpStep, hashRecoveryCode } from "@/lib/totp";
import {
  readTwoFactorTicket,
  discardTwoFactorTicket,
  countFailedTwoFactorAttempt,
} from "@/lib/two-factor-ticket";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getClientIp } from "@/lib/rate-limit";

// POST /api/auth/2fa/verify-login { ticket, code } — completes a login that
// paused for a second factor in app/api/auth/login. Intentionally
// unauthenticated (there's no session yet — the ticket, minted server-side
// after a correct password, IS the credential proving that step already
// happened). Accepts either a live TOTP code or an unused recovery code.
async function handlePOST(req: NextRequest) {
  const { ticket, code } = await req.json().catch(() => ({}));
  if (!ticket || typeof ticket !== "string" || !code || typeof code !== "string") {
    return NextResponse.json({ error: "ticket and code are required" }, { status: 400 });
  }

  const userId = await readTwoFactorTicket(ticket);
  if (!userId) {
    return NextResponse.json({ error: "This login has expired — sign in again.", expired: true }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecretEnc) {
    return NextResponse.json({ error: "Two-factor authentication is not active on this account." }, { status: 400 });
  }
  if (user.suspendedAt) {
    return NextResponse.json({ error: "This account has been suspended. Contact support if you believe this is a mistake." }, { status: 403 });
  }

  const step = verifyTotpStep(decryptSecret(user.twoFactorSecretEnc), code);
  let verified = step !== null && step > (user.twoFactorLastUsedStep ?? -1);

  if (verified) {
    // Burn this time step so the code can't be replayed for the rest of its
    // ~90s validity window (see User.twoFactorLastUsedStep).
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorLastUsedStep: step } });
  } else if (step === null) {
    // Not a live TOTP code at all — fall back to an unused recovery code,
    // one-time use, marked immediately. (A *replayed* TOTP code lands in
    // neither branch and is simply rejected below.)
    const codeHash = hashRecoveryCode(code);
    const recovery = await prisma.twoFactorRecoveryCode.findFirst({
      where: { userId: user.id, codeHash, usedAt: null },
    });
    if (recovery) {
      await prisma.twoFactorRecoveryCode.update({ where: { id: recovery.id }, data: { usedAt: new Date() } });
      verified = true;
    }
  }

  if (!verified) {
    const { lockedOut } = await countFailedTwoFactorAttempt(ticket);
    if (lockedOut) {
      return NextResponse.json(
        { error: "Too many incorrect codes — sign in again.", expired: true },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: "Invalid code" }, { status: 401 });
  }

  await discardTwoFactorTicket(ticket); // one-time use regardless of which factor matched

  const ip = getClientIp(req);
  const token = await finishLogin(req, user, ip);

  const res = NextResponse.json({
    token,
    user: { id: user.id, email: user.email, credits: user.credits },
  });
  setSessionCookie(res, token);
  setLocaleCookieFromUser(res, user.preferredLanguage);
  return res;
}

export const POST = withRateLimit(handlePOST, { limit: 8, windowSec: 900, keyBy: "ip", name: "2fa:verify-login" });
