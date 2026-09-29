import crypto from "crypto";
import { redis } from "@/lib/redis";
import { sendPasswordResetEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { greetingName } from "@/lib/display-name";

export const PASSWORD_RESET_TTL_SEC = 60 * 15; // 15 minutes

/**
 * Mints a single-use reset token and emails the link. Shared by the public
 * forgot-password form and the admin "Send password reset" control, so the
 * token format, lifetime and email are identical either way. Throws if the
 * email can't be sent — callers decide whether that's worth surfacing.
 */
export async function issuePasswordReset(user: { id: string; email: string; name: string | null }): Promise<void> {
  const token = crypto.randomBytes(32).toString("hex");
  await redis.set(`pwd-reset:${token}`, user.id, "EX", PASSWORD_RESET_TTL_SEC);
  const resetLink = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;
  await sendPasswordResetEmail(user.email, greetingName(user.name), resetLink);
}
