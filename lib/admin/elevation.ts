// Admin step-up authentication ("sudo mode"). A normal dashboard session is
// NOT enough to use the admin panel: the admin must confirm an email OTP,
// which grants an elevation window in Redis. Enforced server-side by
// withAdmin (lib/admin/api.ts) — every /api/admin/* call 403s with
// code "elevation_required" until elevated, so the gate is real security,
// not just a screen. Email OTP (not password) because admins may sign in
// via Google and have no usable password.
//
// Elevation belongs to the SESSION that verified the code, not to the admin's
// whole account: keyed by user alone, a token stolen from any other device the
// admin is signed in on inherited full admin access for the rest of the 8-hour
// window without ever seeing the emailed code.

import crypto from "crypto";
import { redis } from "@/lib/redis";

export const ELEVATION_HOURS = 8; // one workday; re-verify each morning
const OTP_TTL_SECONDS = 600; // 10 min
const OTP_MAX_ATTEMPTS = 5;

const elevatedKey = (userId: string, sessionId: string) => `admin-elevated:${userId}:${sessionId}`;
const otpKey = (userId: string) => `admin-otp:${userId}`;

export async function isElevated(userId: string, sessionId: string): Promise<boolean> {
  return (await redis.get(elevatedKey(userId, sessionId))) === "1";
}

export async function grantElevation(userId: string, sessionId: string): Promise<void> {
  await redis.set(elevatedKey(userId, sessionId), "1", "EX", ELEVATION_HOURS * 3600);
}

export async function dropElevation(userId: string, sessionId: string): Promise<void> {
  await redis.del(elevatedKey(userId, sessionId));
}

export async function createElevationOtp(userId: string): Promise<string> {
  const code = crypto.randomInt(100000, 1000000).toString();
  await redis.set(otpKey(userId), JSON.stringify({ code, attempts: 0 }), "EX", OTP_TTL_SECONDS);
  return code;
}

export async function verifyElevationOtp(
  userId: string,
  code: string,
  sessionId: string,
): Promise<{ ok: true } | { ok: false; reason: "expired" | "mismatch" | "too_many_attempts" }> {
  const raw = await redis.get(otpKey(userId));
  if (!raw) return { ok: false, reason: "expired" };
  let stored: { code: string; attempts: number };
  try {
    stored = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "expired" };
  }
  if (stored.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };

  const expected = Buffer.from(stored.code);
  const given = Buffer.from(code.padEnd(expected.length).slice(0, expected.length));
  if (!crypto.timingSafeEqual(expected, given) || code.length !== stored.code.length) {
    // Burn an attempt; keep the original TTL window by re-reading remaining
    // life is overkill here — a fresh 10min on a failed attempt is acceptable.
    await redis.set(otpKey(userId), JSON.stringify({ ...stored, attempts: stored.attempts + 1 }), "EX", OTP_TTL_SECONDS);
    return { ok: false, reason: "mismatch" };
  }

  await redis.del(otpKey(userId));
  await grantElevation(userId, sessionId);
  return { ok: true };
}
