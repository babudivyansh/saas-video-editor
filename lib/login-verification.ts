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
//
// "This login" has to mean this browser, not this address: keyed by email
// alone, a squatter who knows the password they set could keep re-proving it
// every few minutes, so the real owner's code-only sign-in would find the
// squatter's marker and skip the claim — leaving the squatter's password,
// 2FA and sessions on an account that is now "verified". The marker therefore
// carries a random proof that only the password-proving response returns,
// and verify-otp honours it only when the same client sends it back.

import { randomBytes, timingSafeEqual } from "crypto";
import { redis } from "@/lib/redis";

const MARKER_TTL_SECONDS = 600; // same life as the code it accompanies

const key = (email: string) => `login-pw-ok:${email}`;

/** Records the proven password and returns the proof the client must send to verify-otp. */
export async function markPasswordProven(email: string, userId: string): Promise<string> {
  const proof = randomBytes(24).toString("base64url");
  await redis.set(key(email), JSON.stringify({ userId, proof }), "EX", MARKER_TTL_SECONDS);
  return proof;
}

/** Consumes the marker; true only when it names this user and `proof` matches. */
export async function takePasswordProven(email: string, userId: string, proof: unknown): Promise<boolean> {
  if (typeof proof !== "string" || !proof) return false;
  const raw = await redis.get(key(email));
  if (!raw) return false;
  let stored: { userId?: unknown; proof?: unknown };
  try {
    stored = JSON.parse(raw);
  } catch {
    return false;
  }
  if (stored.userId !== userId || typeof stored.proof !== "string") return false;
  const a = Buffer.from(stored.proof);
  const b = Buffer.from(proof);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  await redis.del(key(email));
  return true;
}
