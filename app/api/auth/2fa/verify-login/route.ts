import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionCookie, setLocaleCookieFromUser, verifyToken } from "@/lib/auth";
import { isAdminHostRequest } from "@/lib/admin-host";
import { ELEVATION_HOURS, grantElevation } from "@/lib/admin/elevation";
import { auditEvent, auditIp } from "@/lib/admin/audit";
import { finishLogin } from "@/lib/login-tail";
import { verifySecondFactor } from "@/lib/two-factor-verify";
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

  // TOTP (step burned) or an unused recovery code, behind the per-account
  // failure counter (lib/two-factor-verify.ts) — the per-ticket one below
  // alone let a password holder mint fresh tickets and keep guessing.
  const result = await verifySecondFactor(user, code);

  if (result === "locked") {
    await discardTwoFactorTicket(ticket);
    return NextResponse.json(
      { error: "Too many incorrect codes on this account. Try again in 15 minutes.", expired: true, locked: true },
      { status: 429 },
    );
  }

  if (result === "invalid") {
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

  // On the admin host this sign-in IS the admin step-up: a fresh session that
  // just proved the password (or an emailed code) and the authenticator, on a
  // host whose cookie and /api/admin nothing else can reach. Asking for an
  // emailed code + authenticator again (app/api/admin/elevate) repeated it.
  if (user.role === "ADMIN" && isAdminHostRequest(req)) {
    const { sessionId } = verifyToken(token);
    await grantElevation(user.id, sessionId);
    await auditEvent({
      actorId: user.id,
      actorType: "admin",
      action: "admin.elevated",
      after: { hours: ELEVATION_HOURS, via: "admin-host-sign-in" },
      ip: auditIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
      sessionId,
    });
  }

  const res = NextResponse.json({
    token,
    user: { id: user.id, email: user.email, credits: user.credits },
  });
  setSessionCookie(res, token);
  setLocaleCookieFromUser(res, user.preferredLanguage);
  return res;
}

export const POST = withRateLimit(handlePOST, { limit: 8, windowSec: 900, keyBy: "ip", name: "2fa:verify-login" });
