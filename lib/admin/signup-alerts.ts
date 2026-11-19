// Staff email alerts, managed from Admin → Operations → Notifications.
// Config-KV backed like lib/flags.ts.
//
// Two independent switches:
//   - signupMode: what happens when someone creates an account.
//       "daily"   (default) — nothing per signup; one summary email at 09:00
//                 IST (app/api/cron/admin-daily-digest, lib/admin/staff-digest.ts)
//       "instant" — the old behaviour, one email per signup
//       "off"     — no signup email at all
//   - moneyAlerts: instant email for the few events that need a human the same
//     day (first payment, failed renewal, refund, chargeback, a burst of failed
//     AutoClip runs) — lib/admin/staff-alerts.ts.
//
// Recipients = every ADMIN-role account that hasn't muted itself, PLUS the
// extra addresses saved on the tab.
//
// Rows written before 2026-11-19 hold { enabled, recipients }. enabled:false
// still means off; enabled:true now means "daily" — one email per signup was
// the thing the owner asked to stop.
//
// notifyAdminsOfSignup never throws — same contract as lib/notify.ts: a
// broken staff inbox must not fail the signup that triggered it.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendAdminNewSignupEmail, sendAdminDailyDigestEmail } from "@/lib/email";
import type { SendResult } from "@/lib/email/send";

export const SIGNUP_ALERTS_KEY = "admin_signup_alerts";

export const SIGNUP_MODES = ["off", "instant", "daily"] as const;
export type SignupMode = (typeof SIGNUP_MODES)[number];

export interface SignupAlertSettings {
  signupMode: SignupMode;
  /** Instant emails for money events and AutoClip failure bursts. */
  moneyAlerts: boolean;
  /** Extra addresses, on top of every ADMIN-role account. */
  recipients: string[];
  /** ADMIN-role account emails that asked not to get any of these emails. */
  mutedAdmins: string[];
}

export const DEFAULT_SIGNUP_ALERT_SETTINGS: SignupAlertSettings = {
  signupMode: "daily",
  moneyAlerts: true,
  recipients: [],
  mutedAdmins: [],
};

const emailList = (v: unknown): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((r): r is string => typeof r === "string").map((r) => r.trim().toLowerCase()).filter(Boolean))]
    : [];

/** Reads both the current shape and the pre-2026-11-19 { enabled, recipients } one. */
export function parseSignupAlertSettings(raw: string | null | undefined): SignupAlertSettings {
  if (!raw) return { ...DEFAULT_SIGNUP_ALERT_SETTINGS };
  let v: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_SIGNUP_ALERT_SETTINGS };
    v = parsed as Record<string, unknown>;
  } catch {
    return { ...DEFAULT_SIGNUP_ALERT_SETTINGS };
  }
  const signupMode: SignupMode = SIGNUP_MODES.includes(v.signupMode as SignupMode)
    ? (v.signupMode as SignupMode)
    : v.enabled === false
      ? "off"
      : DEFAULT_SIGNUP_ALERT_SETTINGS.signupMode;
  return {
    signupMode,
    moneyAlerts: typeof v.moneyAlerts === "boolean" ? v.moneyAlerts : DEFAULT_SIGNUP_ALERT_SETTINGS.moneyAlerts,
    recipients: emailList(v.recipients),
    mutedAdmins: emailList(v.mutedAdmins),
  };
}

export async function getSignupAlertSettings(): Promise<SignupAlertSettings> {
  const row = await prisma.config.findUnique({ where: { key: SIGNUP_ALERTS_KEY } });
  return parseSignupAlertSettings(row?.value);
}

export async function setSignupAlertSettings(s: SignupAlertSettings): Promise<SignupAlertSettings> {
  const value: SignupAlertSettings = {
    signupMode: s.signupMode,
    moneyAlerts: s.moneyAlerts,
    recipients: emailList(s.recipients),
    mutedAdmins: emailList(s.mutedAdmins),
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

/**
 * Every address that gets staff email: admin accounts that haven't muted
 * themselves first, then the extras, de-duplicated.
 */
export async function signupAlertRecipients(settings: SignupAlertSettings): Promise<string[]> {
  const muted = new Set(settings.mutedAdmins);
  const admins = (await adminAccountEmails()).map((a) => a.trim().toLowerCase()).filter((a) => !muted.has(a));
  return [...new Set([...admins, ...settings.recipients].filter(Boolean))];
}

export interface NewSignup {
  userId: string;
  email: string;
  name: string | null;
  method: "email" | "google";
  referralCode?: string;
}

export function formatIst(d: Date = new Date()): string {
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
}

export interface TestSendOutcome {
  to: string;
  status: SendResult["status"];
  error?: string;
}

/** Sends one email per recipient, logging (never throwing) on a failed send. */
export async function sendToEach(
  to: string[],
  tag: string,
  send: (addr: string) => Promise<SendResult>,
): Promise<TestSendOutcome[]> {
  return Promise.all(
    to.map(async (addr): Promise<TestSendOutcome> => {
      try {
        const r = await send(addr);
        if (r.status !== "sent" && r.status !== "dev-logged") {
          logger.warn("signup-alerts", `${tag} email to ${addr} not sent`, { status: r.status, reason: r.error });
        }
        return { to: addr, status: r.status, ...(r.error ? { error: r.error } : {}) };
      } catch (e) {
        logger.warn("signup-alerts", `${tag} email to ${addr} failed`, { reason: (e as Error).message });
        return { to: addr, status: "failed", error: (e as Error).message };
      }
    }),
  );
}

/** Called on every new account. Only emails in "instant" mode. */
export async function notifyAdminsOfSignup(u: NewSignup): Promise<void> {
  try {
    const settings = await getSignupAlertSettings();
    if (settings.signupMode !== "instant") return;
    const to = await signupAlertRecipients(settings);
    const signedUpAt = formatIst();
    await sendToEach(to, "new-signup", (addr) => sendAdminNewSignupEmail(addr, { ...u, signedUpAt }));
  } catch (e) {
    logger.warn("signup-alerts", `new-signup alert failed for ${u.userId}`, { reason: (e as Error).message });
  }
}

/**
 * "Send test email" on the Notifications tab: proves the inboxes receive what
 * the current mode sends, regardless of the switches. "instant" sends the
 * per-signup template with sample data; otherwise the real daily summary for
 * the last 24 hours.
 */
export async function sendTestSignupAlert(): Promise<TestSendOutcome[]> {
  const settings = await getSignupAlertSettings();
  const to = await signupAlertRecipients(settings);
  if (settings.signupMode === "instant") {
    const sample = {
      userId: "test",
      email: "test-signup@example.com",
      name: "Test signup (sent from Admin → Operations → Notifications)",
      method: "email" as const,
      signedUpAt: formatIst(),
    };
    return sendToEach(to, "test new-signup", (addr) => sendAdminNewSignupEmail(addr, sample));
  }
  const { buildStaffDigest } = await import("@/lib/admin/staff-digest");
  const digest = await buildStaffDigest(new Date());
  return sendToEach(to, "test daily-digest", (addr) => sendAdminDailyDigestEmail(addr, digest));
}
