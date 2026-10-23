// Checking a second-factor code (a live TOTP code or an unused recovery code)
// for an account that has 2FA on, behind a per-USER failure counter.
//
// verify-login also counts failures per ticket (lib/two-factor-ticket.ts), but
// a ticket only costs the attacker one correct password: with the password in
// hand they can mint a fresh ticket every 5 attempts and keep guessing at
// 1-in-a-million odds per code indefinitely. This counter follows the account
// instead, so it holds however many tickets (or sessions, for the step-up
// checks on 2FA disable / change email) the guesses are spread across.
//
// Too many wrong codes inside the window locks the second factor for
// LOCK_SECONDS — every check refuses, right code or not — and emails the owner
// once, since reaching the 2FA step at all means the password is known.

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { decryptSecret } from "@/lib/encryption";
import { verifyTotpStep, hashRecoveryCode } from "@/lib/totp";
import { logger } from "@/lib/logger";
import { sendTwoFactorLockoutAlertEmail } from "@/lib/email";
import { greetingName } from "@/lib/display-name";

export const USER_MAX_FAILURES = 10;
export const FAILURE_WINDOW_SECONDS = 15 * 60;
export const LOCK_SECONDS = 15 * 60;

const failuresKey = (userId: string) => `2fa-user-failures:${userId}`;
const lockKey = (userId: string) => `2fa-user-lock:${userId}`;

export type SecondFactorResult = "ok" | "invalid" | "locked";

export interface SecondFactorUser {
  id: string;
  email: string;
  name: string | null;
  twoFactorSecretEnc: string | null;
}

export async function isSecondFactorLocked(userId: string): Promise<boolean> {
  return (await redis.get(lockKey(userId))) !== null;
}

/**
 * Accepts a live TOTP code (burning its time step, so it can't be replayed for
 * the rest of its ~90s validity) or an unused recovery code (spent). Both are
 * conditional updates, so two requests racing with the same code can't both
 * win.
 */
async function codeMatches(user: SecondFactorUser, code: string): Promise<boolean> {
  if (!user.twoFactorSecretEnc) return false;
  const step = verifyTotpStep(decryptSecret(user.twoFactorSecretEnc), code);
  if (step !== null) {
    const burned = await prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [{ twoFactorLastUsedStep: null }, { twoFactorLastUsedStep: { lt: step } }],
      },
      data: { twoFactorLastUsedStep: step },
    });
    return burned.count === 1;
  }
  const spent = await prisma.twoFactorRecoveryCode.updateMany({
    where: { userId: user.id, codeHash: hashRecoveryCode(code), usedAt: null },
    data: { usedAt: new Date() },
  });
  return spent.count >= 1;
}

export async function verifySecondFactor(user: SecondFactorUser, code: string): Promise<SecondFactorResult> {
  // Checked first, and before the code: during a lockout even the right code
  // is refused, or the lock would just be a slower oracle.
  if (await isSecondFactorLocked(user.id)) return "locked";

  if (await codeMatches(user, code)) {
    await redis.del(failuresKey(user.id));
    return "ok";
  }

  const failures = await redis.incrWithExpire(failuresKey(user.id), FAILURE_WINDOW_SECONDS);
  if (failures < USER_MAX_FAILURES) return "invalid";

  // NX: of several requests crossing the line together only one sets the lock,
  // and only that one sends the email.
  const locked = await redis.setNx(lockKey(user.id), "1", LOCK_SECONDS);
  await redis.del(failuresKey(user.id));
  if (locked) {
    logger.warn("2fa-lockout", "second factor locked after repeated failures", { userId: user.id });
    const timeStr = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
    sendTwoFactorLockoutAlertEmail(user.email, greetingName(user.name), timeStr, Math.round(LOCK_SECONDS / 60))
      .catch((e) => logger.error("2fa-lockout", "alert email error", e));
  }
  return "locked";
}
