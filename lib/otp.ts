import crypto from "crypto";
import { redis } from "./redis";
import { sendOtpEmail, type DeliveryChannel, type OtpPurpose } from "./email";

export type { OtpPurpose };

const TTL_SECONDS = 600; // 10 minutes

// Keyed by purpose so a code can only do the one thing it was sent for: a
// sign-in code can't finish a signup, and neither can stand in for the
// step-up code that guards account deletion.
function otpKey(purpose: OtpPurpose, email: string): string {
  return `otp:${purpose}:${email}`;
}

function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/** Thrown when a code could not actually be delivered in production. */
export class OtpDeliveryError extends Error {
  constructor() {
    super("Couldn't send the code");
    this.name = "OtpDeliveryError";
  }
}

/**
 * Generates a 6-digit code, stores it (10-min TTL) and emails it.
 *
 * Returns the fields a route may add to its JSON response. Outside
 * production, when no email provider is configured, that includes the code
 * itself so local dev and CI e2e can sign in. In production it never does:
 * a code that didn't go out by email throws OtpDeliveryError instead, so the
 * caller answers with an error rather than a success that leaks the code.
 * (The removed SMS path returned the code in production whenever Twilio was
 * unset or failed — anyone could sign in as anyone by phone number.)
 */
export async function issueOtp(
  purpose: OtpPurpose,
  email: string,
): Promise<{ devCode?: string }> {
  const code = generateOtp();
  await redis.set(otpKey(purpose, email), code, "EX", TTL_SECONDS);
  const channel: DeliveryChannel = await sendOtpEmail(email, code, purpose);
  return otpResponseExtras(channel, code);
}

export function otpResponseExtras(channel: DeliveryChannel, code: string): { devCode?: string } {
  if (channel === "email") return {};
  if (process.env.NODE_ENV === "production") throw new OtpDeliveryError();
  return channel === "dev-console" ? { devCode: code } : {};
}

/** Verifies a submitted code and consumes it (single-use). */
export async function consumeOtp(purpose: OtpPurpose, email: string, otp: unknown): Promise<boolean> {
  if (typeof otp !== "string" && typeof otp !== "number") return false;
  const stored = await redis.get(otpKey(purpose, email));
  if (!stored) return false;

  const a = Buffer.from(stored);
  const b = Buffer.from(String(otp).trim());
  // timingSafeEqual throws on length mismatch rather than just returning
  // false, and the length itself isn't a secret here (codes are always the
  // same length), so compare lengths first the normal way.
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!match) return false;

  await redis.del(otpKey(purpose, email));
  return true;
}
