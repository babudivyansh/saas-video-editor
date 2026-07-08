import type { DeliveryChannel } from "./email";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

/**
 * Sends an OTP code over SMS.
 *
 * Dev-stub by default: when no SMS provider is configured it logs the code to
 * the server console and reports the "dev-console" channel, so phone-OTP login
 * is fully testable without paying for an SMS gateway.
 *
 * To enable real delivery, set the provider env vars:
 * TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER.
 */
export async function sendOtpSms(to: string, otp: string): Promise<DeliveryChannel> {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const from = env.TWILIO_FROM_NUMBER;

  const configured = Boolean(accountSid && authToken && from);

  if (!configured) {
    logger.info("sms:dev", `OTP for ${to}: ${otp}`);
    return "dev-console";
  }

  try {
    const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: to,
        From: from!,
        Body: `Your Clipiro verification code is ${otp}. It expires in 10 minutes.`,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      logger.error("sms:twilio", "Failed to send SMS via Twilio API", err);
      return "dev-console";
    }

    return "sms";
  } catch (error) {
    logger.error("sms:twilio", "Error calling Twilio REST API", error);
    return "dev-console";
  }
}
