// The shared tail end of every *password-based* login completion — issuing
// the session, recording lastLoginAt/LoginEvent, and sending the sign-in
// alert email. Factored out so app/api/auth/login/route.ts and
// app/api/auth/2fa/verify-login/route.ts (which completes a login that
// paused for a TOTP/recovery code) can't drift into two slightly different
// versions of "what happens right after credentials check out."
//
// register/verify-otp/callback-google intentionally do NOT use this — they
// have their own shape (affiliate attribution, welcome email, no existing
// LoginEvent/alert convention) and calling completeLogin() directly there
// is the correct, smaller surface for what they actually need.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { completeLogin, updateSessionCountry } from "@/lib/auth";
import { sendNewLoginAlertEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

export interface LoginTailUser {
  id: string;
  email: string;
  firstName: string | null;
  name: string | null;
}

export async function finishLogin(req: NextRequest, user: LoginTailUser, ip: string): Promise<string> {
  const { token, sessionId, device } = await completeLogin(req, user);

  const now = new Date();
  prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: now } }).catch(() => { /* non-fatal */ });

  const timeStr = now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

  // Fire & forget — geo lookup, LoginEvent, session-country backfill, alert email.
  ;(async () => {
    try {
      let location = "Unknown location";
      let country: string | null = null;
      if (ip !== "unknown" && ip !== "::1" && !ip.startsWith("127.")) {
        const geo = await fetch(`http://ip-api.com/json/${ip}?fields=city,country`, { signal: AbortSignal.timeout(2000) })
          .then((r) => r.json()).catch(() => null);
        if (geo?.city) location = `${geo.city}, ${geo.country}`;
        if (geo?.country) country = geo.country;
      }
      await prisma.loginEvent
        .create({ data: { userId: user.id, ip: ip === "unknown" ? null : ip, device, country } })
        .catch((e) => logger.warn("login-tail", "login event write failed", { reason: (e as Error).message }));
      if (country) await updateSessionCountry(user.id, sessionId, country).catch(() => {});
      await sendNewLoginAlertEmail(user.email, user.firstName ?? user.name ?? "", timeStr, location, device);
    } catch (e) {
      logger.error("login-tail", "alert email error", e);
    }
  })();

  return token;
}
