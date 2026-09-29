// A signup waiting for its emailed code.
//
// Nothing is written to Postgres until the address is proven: the name,
// bcrypt hash and typed referral code wait here for OTP_TTL, and
// app/api/auth/register/verify turns them into a User row. A signup that is
// never confirmed simply expires — no half-made account, no free credits or
// minutes granted to an address nobody owns, and nothing for a squatter to
// pre-register (see lib/account-claim.ts for the accounts made before this).
//
// The code proves the inbox, but on its own it doesn't prove WHICH signup
// form the inbox owner filled in: anyone can POST /register with a victim's
// address and their own password, replacing the victim's pending record while
// the victim's code is in flight — the victim then types the code and creates
// an account with the attacker's password. So each save returns a random
// token that only the browser that submitted the form receives, and verify
// requires it back. A replaced record just makes the victim's verify fail
// ("sign up again"), never hands the account to someone else.

import { randomBytes, timingSafeEqual } from "crypto";
import { redis } from "@/lib/redis";

const PENDING_TTL_SECONDS = 600; // matches the OTP's own 10-minute life

export interface PendingSignup {
  name: string;
  passwordHash: string;
  referralCode: string | null;
}

interface StoredPendingSignup extends PendingSignup {
  token: string;
}

const key = (email: string) => `signup-pending:${email}`;

/** Saves the pending signup and returns the token the verify step must present. */
export async function savePendingSignup(email: string, pending: PendingSignup): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  const stored: StoredPendingSignup = { ...pending, token };
  await redis.set(key(email), JSON.stringify(stored), "EX", PENDING_TTL_SECONDS);
  return token;
}

async function readStored(email: string): Promise<StoredPendingSignup | null> {
  const raw = await redis.get(key(email));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredPendingSignup;
  } catch {
    return null;
  }
}

/** Whether any signup is waiting on this address (resend only needs this much). */
export async function hasPendingSignup(email: string): Promise<boolean> {
  return (await readStored(email)) !== null;
}

/**
 * The pending signup for this address, but only when `token` is the one
 * issued to the browser that created it. A missing record and a mismatched
 * token look the same to the caller — both mean "start again".
 */
export async function readPendingSignup(email: string, token: unknown): Promise<PendingSignup | null> {
  const stored = await readStored(email);
  if (!stored || typeof stored.token !== "string" || typeof token !== "string") return null;
  const a = Buffer.from(stored.token);
  const b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { name: stored.name, passwordHash: stored.passwordHash, referralCode: stored.referralCode };
}

export async function clearPendingSignup(email: string): Promise<void> {
  await redis.del(key(email));
}
