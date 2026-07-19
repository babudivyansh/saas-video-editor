import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth";
import { finishLogin } from "@/lib/login-tail";
import { decryptSecret } from "@/lib/encryption";
import { verifyTotp, hashRecoveryCode } from "@/lib/totp";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getClientIp } from "@/lib/rate-limit";
import { LOCALE_COOKIE, isSupportedLocale } from "@/lib/i18n-locales";

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

  const userId = await redis.get(`2fa-pending:${ticket}`);
  if (!userId) {
    return NextResponse.json({ error: "This login has expired — sign in again." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecretEnc) {
    return NextResponse.json({ error: "Two-factor authentication is not active on this account." }, { status: 400 });
  }
  if (user.suspendedAt) {
    return NextResponse.json({ error: "This account has been suspended. Contact support if you believe this is a mistake." }, { status: 403 });
  }

  let verified = verifyTotp(decryptSecret(user.twoFactorSecretEnc), code);

  if (!verified) {
    // Fall back to an unused recovery code — one-time use, marked immediately.
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
    return NextResponse.json({ error: "Invalid code" }, { status: 401 });
  }

  await redis.del(`2fa-pending:${ticket}`); // one-time use regardless of which factor matched

  const ip = getClientIp(req);
  const token = await finishLogin(req, user, ip);

  const res = NextResponse.json({
    token,
    user: { id: user.id, email: user.email, credits: user.credits },
  });
  setSessionCookie(res, token);
  if (isSupportedLocale(user.preferredLanguage)) {
    res.cookies.set(LOCALE_COOKIE, user.preferredLanguage, { maxAge: 60 * 60 * 24 * 365, path: "/", sameSite: "lax" });
  }
  return res;
}

export const POST = withRateLimit(handlePOST, { limit: 8, windowSec: 900, keyBy: "ip", name: "2fa:verify-login" });
