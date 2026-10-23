// "Someone signed up" email to staff, managed from Admin → Operations →
// Notifications. Config-KV backed like lib/flags.ts. With no row it is ON and
// goes to every ADMIN-role account, so it works in prod without a seed.
//
// Recipients = every ADMIN-role account PLUS the extra addresses saved on the
// Notifications tab. Extras used to REPLACE the admin accounts, so adding one
// address silently stopped the email reaching the admins themselves.
//
// notifyAdminsOfSignup never throws — same contract as lib/notify.ts: a
// broken staff inbox must not fail the signup that triggered it.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendAdminNewSignupEmail } from "@/lib/email";
import type { SendResult } from "@/lib/email/send";

export const SIGNUP_ALERTS_KEY = "admin_signup_alerts";

export interface SignupAlertSettings {
  enabled: boolean;
  /** Extra addresses, on top of every ADMIN-role account. */
  recipients: string[];
}

export const DEFAULT_SIGNUP_ALERT_SETTINGS: SignupAlertSettings = { enabled: true, recipients: [] };

export async function getSignupAlertSettings(): Promise<SignupAlertSettings> {
  const row = await prisma.config.findUnique({ where: { key: SIGNUP_ALERTS_KEY } });
  if (!row) return { ...DEFAULT_SIGNUP_ALERT_SETTINGS };
  try {
    const v = JSON.parse(row.value) as Partial<SignupAlertSettings>;
    return {
      enabled: typeof v.enabled === "boolean" ? v.enabled : DEFAULT_SIGNUP_ALERT_SETTINGS.enabled,
      recipients: Array.isArray(v.recipients) ? v.recipients.filter((r): r is string => typeof r === "string") : [],
    };
  } catch {
    return { ...DEFAULT_SIGNUP_ALERT_SETTINGS };
  }
}

export async function setSignupAlertSettings(s: SignupAlertSettings): Promise<SignupAlertSettings> {
  const value: SignupAlertSettings = {
    enabled: s.enabled,
    recipients: [...new Set(s.recipients.map((r) => r.trim().toLowerCase()).filter(Boolean))],
  };
  await prisma.config.upsert({
    where: { key: SIGNUP_ALERTS_KEY },
    update: { value: JSON.stringify(value) },
    create: { key: SIGNUP_ALERTS_KEY, value: JSON.stringify(value) },
  });
  return value;
}

export async function adminAccountEmails(): Promise<string[]> {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true } });
  return admins.map((a) => a.email);
}

/** Every address that gets the email: admin accounts first, then the extras, de-duplicated. */
export async function signupAlertRecipients(settings: SignupAlertSettings): Promise<string[]> {
  const admins = await adminAccountEmails();
  return [...new Set([...admins, ...settings.recipients].map((r) => r.trim().toLowerCase()).filter(Boolean))];
}

export interface NewSignup {
  userId: string;
  email: string;
  name: string | null;
  method: "email" | "google";
  referralCode?: string;
}

function signedUpAtNow(): string {
  return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
}

export async function notifyAdminsOfSignup(u: NewSignup): Promise<void> {
  try {
    const settings = await getSignupAlertSettings();
    if (!settings.enabled) return;
    const to = await signupAlertRecipients(settings);
    const signedUpAt = signedUpAtNow();
    await Promise.all(
      to.map((addr) =>
        sendAdminNewSignupEmail(addr, { ...u, signedUpAt })
          .then((r) => {
            if (r.status !== "sent" && r.status !== "dev-logged") {
              logger.warn("signup-alerts", `new-signup email to ${addr} not sent`, { status: r.status, reason: r.error });
            }
          })
          .catch((e) =>
            logger.warn("signup-alerts", `new-signup email to ${addr} failed`, { reason: (e as Error).message })),
      ),
    );
  } catch (e) {
    logger.warn("signup-alerts", `new-signup alert failed for ${u.userId}`, { reason: (e as Error).message });
  }
}

export interface TestSendOutcome {
  to: string;
  status: SendResult["status"];
  error?: string;
}

/**
 * "Send test email" on the Notifications tab: the real template to the real
 * recipient list, with sample signup data, regardless of the on/off switch —
 * the point is to prove the inboxes receive it before relying on it.
 */
export async function sendTestSignupAlert(): Promise<TestSendOutcome[]> {
  const to = await signupAlertRecipients(await getSignupAlertSettings());
  const sample = {
    userId: "test",
    email: "test-signup@example.com",
    name: "Test signup (sent from Admin → Operations → Notifications)",
    method: "email" as const,
    signedUpAt: signedUpAtNow(),
  };
  return Promise.all(
    to.map(async (addr): Promise<TestSendOutcome> => {
      try {
        const r = await sendAdminNewSignupEmail(addr, sample);
        return { to: addr, status: r.status, ...(r.error ? { error: r.error } : {}) };
      } catch (e) {
        return { to: addr, status: "failed", error: (e as Error).message };
      }
    }),
  );
}
