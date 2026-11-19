// Instant staff emails for the few events worth interrupting someone for:
// a first payment, a failed renewal, a refund, a chargeback, and a burst of
// failed AutoClip runs. Everything else waits for the 09:00 IST summary
// (lib/admin/staff-digest.ts). Switched by "money alerts" on Admin →
// Operations → Notifications; recipients as in lib/admin/signup-alerts.ts.
//
// Every export here never throws: an alert must not fail the webhook or job
// that triggered it. Razorpay redelivers webhooks and sends two events for
// one refund, so each alert claims a Redis key first (setNx) and only the
// first claim sends.

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { sendAdminStaffAlertEmail } from "@/lib/email";
import type { AdminStaffAlertData } from "@/lib/email/templates/admin";
import { getSignupAlertSettings, sendToEach, signupAlertRecipients } from "@/lib/admin/signup-alerts";

const DAY_SECONDS = 86_400;
/** Failed AutoClip runs inside one hour that count as a burst. */
export const AUTOCLIP_BURST_THRESHOLD = 3;

function money(amountMinor: number, currency = "INR"): string {
  const symbol = currency === "INR" ? "₹" : currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${(amountMinor / 100).toFixed(2)}`;
}

/** Sends `alert` once per `dedupeKey` (for `ttlSeconds`), if money alerts are on. */
export async function alertStaff(dedupeKey: string, alert: AdminStaffAlertData, ttlSeconds = 7 * DAY_SECONDS): Promise<boolean> {
  try {
    const settings = await getSignupAlertSettings();
    if (!settings.moneyAlerts) return false;
    if (!(await redis.setNx(`staff-alert:${dedupeKey}`, "1", ttlSeconds))) return false;
    const to = await signupAlertRecipients(settings);
    await sendToEach(to, `staff-alert ${dedupeKey}`, (addr) => sendAdminStaffAlertEmail(addr, alert));
    return true;
  } catch (e) {
    logger.warn("staff-alerts", `alert ${dedupeKey} failed`, { reason: (e as Error).message });
    return false;
  }
}

async function userLabel(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return u?.email ?? userId;
}

/**
 * After a payment is fulfilled. Alerts only when it is the user's first paid
 * purchase — renewals and repeat packs go in the daily summary.
 */
export async function alertIfFirstPayment(args: {
  userId: string | undefined | null;
  paymentId: string;
  amountInPaise: number;
  currency?: string;
}): Promise<void> {
  try {
    if (!args.userId || args.amountInPaise <= 0) return;
    const paid = await prisma.purchase.count({ where: { userId: args.userId, amountInPaise: { gt: 0 } } });
    if (paid !== 1) return;
    const [who, plan] = await Promise.all([
      userLabel(args.userId),
      prisma.user.findUnique({ where: { id: args.userId }, select: { plan: { select: { name: true } } } }),
    ]);
    await alertStaff(`first-payment:${args.userId}`, {
      title: `First payment: ${who}`,
      summary: "A user paid for the first time.",
      tone: "success",
      rows: [
        { label: "Amount", value: money(args.amountInPaise, args.currency) },
        { label: "Plan", value: plan?.plan?.name ?? "Top-up / pack" },
        { label: "Payment", value: args.paymentId },
      ],
      href: `/admin/users/${encodeURIComponent(args.userId)}`,
      hrefLabel: "Open user",
    }, 365 * DAY_SECONDS);
  } catch (e) {
    logger.warn("staff-alerts", "first-payment alert failed", { reason: (e as Error).message });
  }
}

/** A subscription renewal was declined (Razorpay payment.failed). One per subscription per day. */
export async function alertRenewalFailed(args: { subscriptionId: string; userId?: string | null; reason: string | null }): Promise<void> {
  try {
    const who = args.userId ? await userLabel(args.userId) : args.subscriptionId;
    const day = new Date().toISOString().slice(0, 10);
    await alertStaff(`renewal-failed:${args.subscriptionId}:${day}`, {
      title: `Renewal failed: ${who}`,
      summary: "A subscription payment was declined. Razorpay will retry; the customer has been told.",
      tone: "warning",
      rows: [
        { label: "Subscription", value: args.subscriptionId },
        { label: "Reason", value: args.reason ?? "Not given" },
      ],
      href: args.userId ? `/admin/users/${encodeURIComponent(args.userId)}` : "/admin/subscriptions",
      hrefLabel: args.userId ? "Open user" : "Open subscriptions",
    }, 2 * DAY_SECONDS);
  } catch (e) {
    logger.warn("staff-alerts", "renewal-failed alert failed", { reason: (e as Error).message });
  }
}

/** A refund was mirrored from Razorpay. */
export async function alertRefund(args: { paymentId: string; refundId?: string | null; partial: boolean }): Promise<void> {
  try {
    const purchase = await prisma.purchase.findUnique({
      where: { id: args.paymentId },
      select: { userId: true, amountInPaise: true, currency: true },
    });
    const who = purchase ? await userLabel(purchase.userId) : args.paymentId;
    await alertStaff(`refund:${args.refundId ?? args.paymentId}`, {
      title: `${args.partial ? "Partial refund" : "Refund"}: ${who}`,
      summary: "A payment was refunded and what it bought was taken back.",
      tone: "warning",
      rows: [
        { label: "Payment", value: args.paymentId },
        ...(purchase ? [{ label: "Original amount", value: money(purchase.amountInPaise, purchase.currency) }] : []),
      ],
      href: purchase ? `/admin/users/${encodeURIComponent(purchase.userId)}` : "/admin/purchases",
      hrefLabel: purchase ? "Open user" : "Open purchases",
    });
  } catch (e) {
    logger.warn("staff-alerts", "refund alert failed", { reason: (e as Error).message });
  }
}

/** A chargeback was opened. The in-app admin notification already exists; this is the email. */
export async function alertDispute(args: { paymentId: string; reason: string | null; amountMinor: number | null }): Promise<void> {
  await alertStaff(`dispute:${args.paymentId}`, {
    title: `Chargeback opened on ${args.paymentId}`,
    summary: "Submit evidence in the Razorpay dashboard before the deadline, or the payment is lost.",
    tone: "danger",
    rows: [
      { label: "Reason", value: args.reason ?? "Not given" },
      ...(args.amountMinor != null ? [{ label: "Amount", value: money(args.amountMinor) }] : []),
    ],
    href: "/admin/purchases",
    hrefLabel: "Open purchases",
  });
}

/**
 * After an AutoClip run fails. Alerts once per clock hour when
 * AUTOCLIP_BURST_THRESHOLD or more runs have failed in the last 60 minutes —
 * one failure is a bad file, three is usually an outage.
 */
export async function noteAutoClipFailure(): Promise<void> {
  try {
    const since = new Date(Date.now() - 3_600_000);
    const failed = await prisma.project.findMany({
      where: { productType: "auto-clip", status: "failed", updatedAt: { gte: since } },
      select: { failureReason: true },
    });
    if (failed.length < AUTOCLIP_BURST_THRESHOLD) return;
    const counts = new Map<string, number>();
    for (const f of failed) {
      const k = f.failureReason ?? "No reason recorded";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const hour = new Date().toISOString().slice(0, 13);
    await alertStaff(`autoclip-burst:${hour}`, {
      title: `${failed.length} AutoClip runs failed in the last hour`,
      summary: "Several runs failed close together. Check Admin → Operations → Jobs and Sentry.",
      tone: "danger",
      rows: top ? [{ label: "Most common reason", value: `${top[0]} (×${top[1]})` }] : [],
      href: "/admin/ops",
      hrefLabel: "Open operations",
    }, 2 * 3_600);
  } catch (e) {
    logger.warn("staff-alerts", "autoclip burst check failed", { reason: (e as Error).message });
  }
}
