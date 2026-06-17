import { redis } from "./redis";
import { sendOtpEmail, type DeliveryChannel } from "./email";
import { sendOtpSms } from "./sms";

export type OtpMethod = "email" | "phone";

const TTL_SECONDS = 600; // 10 minutes

function otpKey(method: OtpMethod, identifier: string): string {
  return `otp:login:${method}:${identifier}`;
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
  if (!stored || stored !== String(otp)) return false;
  await redis.del(otpKey(method, identifier));
  return true;
}
