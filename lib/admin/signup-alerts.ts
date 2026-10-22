// "Someone signed up" email to staff, managed from Admin → Operations →
// Notifications. Config-KV backed like lib/flags.ts. With no row it is ON and
// goes to every ADMIN-role account, so it works in prod without a seed.
//
// notifyAdminsOfSignup never throws — same contract as lib/notify.ts: a
// broken staff inbox must not fail the signup that triggered it.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendAdminNewSignupEmail } from "@/lib/email";

export const SIGNUP_ALERTS_KEY = "admin_signup_alerts";

export interface SignupAlertSettings {
  enabled: boolean;
  /** Empty = every ADMIN-role account. */
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

export interface NewSignup {
  userId: string;
  email: string;
  name: string | null;
  method: "email" | "google";
  referralCode?: string;
}

export async function notifyAdminsOfSignup(u: NewSignup): Promise<void> {
  try {
    const settings = await getSignupAlertSettings();
    if (!settings.enabled) return;
    const to = settings.recipients.length > 0 ? settings.recipients : await adminAccountEmails();
    const signedUpAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
    await Promise.all(
      to.map((addr) =>
        sendAdminNewSignupEmail(addr, { ...u, signedUpAt }).catch((e) =>
          logger.warn("signup-alerts", `new-signup email to ${addr} failed`, { reason: (e as Error).message })),
      ),
    );
  } catch (e) {
    logger.warn("signup-alerts", `new-signup alert failed for ${u.userId}`, { reason: (e as Error).message });
  }
}
