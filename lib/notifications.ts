// Per-user opt-out checks for non-critical email categories. A missing
// NotificationPreference row means "every default (on)" — the row is only
// ever created lazily (first read or write), never at signup, so most users
// never get one until they actually visit the Notifications settings tab.
//
// Deliberately NOT used for security-critical transactional mail (new-login
// alert, password-changed, email-changed, purchase confirmation) — those
// call sendXEmail directly and always send, matching how every mature SaaS
// treats security/receipt mail as non-negotiable.

import { prisma } from "@/lib/prisma";
import type { NotificationPreference } from "@prisma/client";

export type NotificationCategory =
  | "usageAlerts" // low/zero-credit alerts
  | "creditAlerts" // subscription expiry/expired, unused-credits reminder
  | "productUpdates" // onboarding drip (day 1/3/7)
  | "weeklySummary"
  | "featureReleases"
  | "marketingEmails" // re-engagement 7/30-day
  | "newsletter";

const DEFAULTS: Omit<NotificationPreference, "userId" | "updatedAt"> = {
  marketingEmails: true,
  productUpdates: true,
  usageAlerts: true,
  creditAlerts: true,
  weeklySummary: true,
  featureReleases: true,
  newsletter: true,
};

export async function getNotificationPreference(userId: string): Promise<NotificationPreference> {
  const existing = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (existing) return existing;
  return { userId, updatedAt: new Date(), ...DEFAULTS };
}

/** True unless the user has explicitly opted out of this category. */
export async function shouldSendCategory(userId: string, category: NotificationCategory): Promise<boolean> {
  const pref = await getNotificationPreference(userId);
  return pref[category];
}

export async function upsertNotificationPreference(
  userId: string,
  updates: Partial<Omit<NotificationPreference, "userId" | "updatedAt">>,
): Promise<NotificationPreference> {
  return prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...DEFAULTS, ...updates },
    update: updates,
  });
}
