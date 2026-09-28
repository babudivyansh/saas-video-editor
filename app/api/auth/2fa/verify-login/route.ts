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

  const pending = await readTwoFactorTicket(ticket);
  if (!pending) {
    return NextResponse.json({ error: "This login has expired — sign in again.", expired: true }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: pending.userId } });
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecretEnc) {
    return NextResponse.json({ error: "Two-factor authentication is not active on this account." }, { status: 400 });
  }
  if (user.suspendedAt) {
    return NextResponse.json({ error: "This account has been suspended. Contact support if you believe this is a mistake." }, { status: 403 });
  }
  // A reactivation ticket is the one case a deactivated account may finish
  // here — that is the point of it. Any other ticket for an account that was
  // deactivated after the password step does not get a session.
  if (user.deactivatedAt && !pending.reactivate) {
    return NextResponse.json({ error: "This account is deactivated.", deactivated: true }, { status: 403 });
  }

  let verified = false;
  const step = verifyTotpStep(decryptSecret(user.twoFactorSecretEnc), code);

  if (step !== null) {
    // Burn this time step so the code can't be replayed for the rest of its
    // ~90s validity window (see User.twoFactorLastUsedStep). Conditional, so
    // two requests racing with the same code can't both win.
    const burned = await prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [{ twoFactorLastUsedStep: null }, { twoFactorLastUsedStep: { lt: step } }],
      },
      data: { twoFactorLastUsedStep: step },
    });
    verified = burned.count === 1;
  } else {
    // Not a live TOTP code at all — fall back to an unused recovery code,
    // one-time use. Spent with a conditional update rather than find-then-
    // update, which let two parallel requests spend the same code twice.
    const spent = await prisma.twoFactorRecoveryCode.updateMany({
      where: { userId: user.id, codeHash: hashRecoveryCode(code), usedAt: null },
      data: { usedAt: new Date() },
    });
    verified = spent.count >= 1;
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

  if (pending.reactivate && user.deactivatedAt) {
    await prisma.user.update({
      where: { id: user.id },
      data: { deactivatedAt: null, deactivationScheduledPurgeAt: null },
    });
  }

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
