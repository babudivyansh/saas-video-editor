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
import { greetingName } from "@/lib/display-name";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { auditEvent } from "@/lib/admin/audit";

export interface LoginTailUser {
  id: string;
  email: string;
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
      // An admin sign-in is a security event: it goes in the audit log too,
      // tied to the session it opened.
      const role = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } }).then((u) => u?.role).catch(() => null);
      if (role === "ADMIN") {
        await auditEvent({
          actorId: user.id,
          actorType: "admin",
          action: "admin.signed_in",
          ip: ip === "unknown" ? undefined : ip,
          userAgent: req.headers.get("user-agent") ?? undefined,
          sessionId,
          after: { device },
        });
      }
      let location = "Unknown location";
      let country: string | null = null;
      // ipinfo Lite over HTTPS. Replaces ip-api.com, which was plain HTTP (every
      // user's IP in cleartext) and licensed for non-commercial use only. Lite
      // resolves to country, not city.
      if (env.IPINFO_TOKEN && ip !== "unknown" && ip !== "::1" && !ip.startsWith("127.")) {
        const geo = await fetch(`https://api.ipinfo.io/lite/${encodeURIComponent(ip)}`, {
          headers: { Authorization: `Bearer ${env.IPINFO_TOKEN}` },
          signal: AbortSignal.timeout(2000),
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { country?: string } | null;
        if (geo?.country) {
          country = geo.country;
          location = geo.country;
        }
      }
      await prisma.loginEvent
        .create({ data: { userId: user.id, ip: ip === "unknown" ? null : ip, device, country } })
        .catch((e) => logger.warn("login-tail", "login event write failed", { reason: (e as Error).message }));
      if (country) await updateSessionCountry(user.id, sessionId, country).catch(() => {});
      await sendNewLoginAlertEmail(user.email, greetingName(user.name), timeStr, location, device);
    } catch (e) {
      logger.error("login-tail", "alert email error", e);
    }
  })();

  return token;
}
