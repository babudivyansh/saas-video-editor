// Re-confirming identity before a sensitive action (delete/deactivate the
// account, change email, turn 2FA on/off, new recovery codes).
//
// These all used to demand the current password — which a Google-created
// account doesn't have (its hash is random and was never shown to anyone), so
// those users could not delete their account, change email or enable 2FA at
// all. Now: the password when the account has one, otherwise a 6-digit code
// emailed by POST /api/auth/step-up/send.

import bcrypt from "bcryptjs";

export interface StepUpUser {
  email: string;
  passwordHash: string;
  hasPassword?: boolean;
}

export type StepUpResult = { ok: true } | { ok: false; error: string };

export async function verifyStepUp(
  user: StepUpUser,
  body: { password?: unknown; otp?: unknown },
): Promise<StepUpResult> {
  // Only an explicit false switches to the emailed code — a caller that didn't
  // select the flag keeps the stricter password check.
  if (user.hasPassword !== false) {
    if (typeof body.password !== "string" || !body.password) {
      return { ok: false, error: "Enter your password to continue" };
    }
    const valid = await bcrypt.compare(body.password, user.passwordHash);
    return valid ? { ok: true } : { ok: false, error: "Incorrect password" };
  }

  if (typeof body.otp !== "string" || !body.otp) {
    return { ok: false, error: "Enter the code we emailed you" };
  }
  // Loaded only on this branch: the OTP module pulls in the email stack,
  // which a password confirmation never needs.
  const { consumeOtp } = await import("@/lib/otp");
  const valid = await consumeOtp("step-up", user.email, body.otp);
  return valid ? { ok: true } : { ok: false, error: "Invalid or expired code" };
}
