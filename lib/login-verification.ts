// The one-time email check for accounts created before signup verified
// addresses (2026-09-28).
//
// A password login for an unverified account doesn't get a session: it gets a
// sign-in code emailed instead, and /api/auth/verify-otp finishes the login.
// The marker records that THIS login already proved the password, so
// verify-otp just marks the address verified. A code-only login with no
// marker proved the inbox but not the password — verify-otp then treats it as
// an ownership claim (lib/account-claim.ts), because the password may have
// been set by someone who registered the address first.

import { redis } from "@/lib/redis";

const MARKER_TTL_SECONDS = 600; // same life as the code it accompanies

const key = (email: string) => `login-pw-ok:${email}`;

export async function markPasswordProven(email: string, userId: string): Promise<void> {
  await redis.set(key(email), userId, "EX", MARKER_TTL_SECONDS);
}

/** Consumes the marker; true when it existed and names this user. */
export async function takePasswordProven(email: string, userId: string): Promise<boolean> {
  const stored = await redis.get(key(email));
  if (!stored) return false;
  await redis.del(key(email));
  return stored === userId;
}
