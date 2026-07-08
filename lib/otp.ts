import crypto from "crypto";
import { redis } from "./redis";
import { sendOtpEmail, type DeliveryChannel } from "./email";
import { sendOtpSms } from "./sms";

export type OtpMethod = "email" | "phone";

const TTL_SECONDS = 600; // 10 minutes

function otpKey(method: OtpMethod, identifier: string): string {
  return `otp:login:${method}:${identifier}`;
}

function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Generates a 6-digit code, stores it (10-min TTL), and dispatches it over the
 * requested channel. Returns the delivery channel; when it's "dev-console" the
 * caller may surface the code to the client so dev login works without a real
 * email/SMS provider.
 */
export async function issueOtp(
  method: OtpMethod,
  identifier: string
): Promise<{ code: string; channel: DeliveryChannel }> {
  const code = generateOtp();
  await redis.set(otpKey(method, identifier), code, "EX", TTL_SECONDS);
  const channel =
    method === "email"
      ? await sendOtpEmail(identifier, code)
      : await sendOtpSms(identifier, code);
  return { code, channel };
}

/** Verifies a submitted code and consumes it (single-use). */
export async function consumeOtp(
  method: OtpMethod,
  identifier: string,
  otp: string
): Promise<boolean> {
  const stored = await redis.get(otpKey(method, identifier));
  if (!stored) return false;

  const a = Buffer.from(stored);
  const b = Buffer.from(String(otp));
  // timingSafeEqual throws on length mismatch rather than just returning
  // false, and the length itself isn't a secret here (codes are always the
  // same length), so compare lengths first the normal way.
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!match) return false;

  await redis.del(otpKey(method, identifier));
  return true;
}
