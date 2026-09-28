// A signup waiting for its emailed code.
//
// Nothing is written to Postgres until the address is proven: the name,
// bcrypt hash and typed referral code wait here for OTP_TTL, and
// app/api/auth/register/verify turns them into a User row. A signup that is
// never confirmed simply expires — no half-made account, no free credits or
// minutes granted to an address nobody owns, and nothing for a squatter to
// pre-register (see lib/account-claim.ts for the accounts made before this).

import { redis } from "@/lib/redis";

const PENDING_TTL_SECONDS = 600; // matches the OTP's own 10-minute life

export interface PendingSignup {
  name: string;
  passwordHash: string;
  referralCode: string | null;
}

const key = (email: string) => `signup-pending:${email}`;

export async function savePendingSignup(email: string, pending: PendingSignup): Promise<void> {
  await redis.set(key(email), JSON.stringify(pending), "EX", PENDING_TTL_SECONDS);
}

export async function readPendingSignup(email: string): Promise<PendingSignup | null> {
  const raw = await redis.get(key(email));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingSignup;
  } catch {
    return null;
  }
}

export async function clearPendingSignup(email: string): Promise<void> {
  await redis.del(key(email));
}
