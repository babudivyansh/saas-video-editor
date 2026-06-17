import type { DeliveryChannel } from "./email";

/**
 * Sends an OTP code over SMS.
 *
 * Dev-stub by default: when no SMS provider is configured it logs the code to
 * the server console and reports the "dev-console" channel, so phone-OTP login
 * is fully testable without paying for an SMS gateway.
 *
 * To enable real delivery, set the provider env vars and implement the marked
 * block below (e.g. Twilio: TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
 * TWILIO_FROM_NUMBER). No other code needs to change — callers only read the
 * returned DeliveryChannel.
 */
export async function sendOtpSms(to: string, otp: string): Promise<DeliveryChannel> {
  const configured = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);

  if (!configured) {
    console.log(`[sms:dev] OTP for ${to}: ${otp}`);
    return "dev-console";
  }

  // ── Real provider integration goes here ──────────────────────────────────
  // Example (Twilio):
  //   const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  //   await client.messages.create({
  //     to,
  //     from: process.env.TWILIO_FROM_NUMBER,
  //     body: `Your ClipForge verification code is ${otp}. It expires in 10 minutes.`,
  //   });
  //   return "sms";
  // ─────────────────────────────────────────────────────────────────────────

  // Until the provider call above is implemented, fall back to dev logging so
  // nothing silently fails even if the env vars are present.
  console.log(`[sms:dev] OTP for ${to}: ${otp}`);
  return "dev-console";
}
