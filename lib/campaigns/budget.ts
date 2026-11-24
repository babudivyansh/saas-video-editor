// How many campaign emails may go out right now.
//
// The email providers are on free plans (about 600 sends a day across Brevo,
// Mailjet and Resend — lib/email/router/config.ts) and that quota is shared
// with sign-in codes, receipts and trial reminders. A campaign must never be
// what makes an OTP bounce off a full quota, so it only ever spends what is
// left after holding back a share of the day for everything else, and never
// more than an admin-set daily cap.

import { prisma } from "@/lib/prisma";
import { routerEnabled } from "@/lib/email/router/config";
import { getProviderCards } from "@/lib/email/router/admin-queries";
import { isNoncriticalPaused } from "@/lib/email/router/deliver";
import { dayPeriod } from "@/lib/email/router/periods";

/** Config KV: admin-set maximum campaign emails per day. */
export const CAMPAIGN_DAILY_CAP_KEY = "email_campaign_daily_cap";
import { BATCH_PER_RUN, DEFAULT_DAILY_CAP, MAX_DAILY_CAP, RESERVE_SHARE } from "./budget-constants";
export { BATCH_PER_RUN, DEFAULT_DAILY_CAP, MAX_DAILY_CAP, RESERVE_SHARE };

/** Provider states a campaign must not count on. */
const UNUSABLE = new Set(["not_configured", "disabled", "quota_exhausted", "misconfigured", "suspended"]);

export interface CampaignBudget {
  /** Sends allowed in this run. */
  allowed: number;
  /** Campaign emails already sent today (UTC day, the router's quota day). */
  sentToday: number;
  dailyCap: number;
  /** Quota left today across usable providers; null when unknown or unlimited. */
  providerSpare: number | null;
  /** Slots held back for non-campaign mail. */
  reserve: number;
  /** Why nothing can be sent, when allowed is 0. */
  blockedBy: "paused" | "daily_cap" | "quota" | null;
}

export async function getDailyCap(): Promise<number> {
  const row = await prisma.config.findUnique({ where: { key: CAMPAIGN_DAILY_CAP_KEY } });
  const n = row ? Number(JSON.parse(row.value)) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= MAX_DAILY_CAP ? n : DEFAULT_DAILY_CAP;
}

export async function setDailyCap(cap: number): Promise<void> {
  await prisma.config.upsert({
    where: { key: CAMPAIGN_DAILY_CAP_KEY },
    create: { key: CAMPAIGN_DAILY_CAP_KEY, value: JSON.stringify(cap) },
    update: { value: JSON.stringify(cap) },
  });
}

interface ProviderCardLike {
  configured: boolean;
  enabled: boolean;
  status: string;
  daily: { limit: number | null; remaining: number | null };
  monthly: { remaining: number | null };
}

/** Pure part, for tests: spare quota and reserve from provider cards. */
export function quotaHeadroom(cards: ProviderCardLike[]): { spare: number | null; reserve: number } {
  const usable = cards.filter((c) => c.configured && c.enabled && !UNUSABLE.has(c.status));
  if (usable.length === 0) return { spare: 0, reserve: 0 };
  let spare = 0;
  let unlimited = false;
  let totalDaily = 0;
  for (const c of usable) {
    const left = Math.min(c.daily.remaining ?? Infinity, c.monthly.remaining ?? Infinity);
    if (left === Infinity) unlimited = true;
    else spare += left;
    totalDaily += c.daily.limit ?? 0;
  }
  return { spare: unlimited ? null : spare, reserve: Math.ceil(totalDaily * RESERVE_SHARE) };
}

export function combineBudget(i: {
  paused: boolean;
  dailyCap: number;
  sentToday: number;
  providerSpare: number | null;
  reserve: number;
}): Pick<CampaignBudget, "allowed" | "blockedBy"> {
  if (i.paused) return { allowed: 0, blockedBy: "paused" };
  const capLeft = Math.max(0, i.dailyCap - i.sentToday);
  if (capLeft === 0) return { allowed: 0, blockedBy: "daily_cap" };
  const quotaLeft = i.providerSpare == null ? Infinity : Math.max(0, i.providerSpare - i.reserve);
  if (quotaLeft === 0) return { allowed: 0, blockedBy: "quota" };
  return { allowed: Math.min(BATCH_PER_RUN, capLeft, quotaLeft), blockedBy: null };
}

export async function campaignBudget(now: Date = new Date()): Promise<CampaignBudget> {
  const day = dayPeriod(now);
  const [dailyCap, sentToday, paused] = await Promise.all([
    getDailyCap(),
    prisma.emailCampaignRecipient.count({
      where: { status: { in: ["sent", "queued"] }, sentAt: { gte: day.start, lt: day.end } },
    }),
    routerEnabled() ? isNoncriticalPaused() : Promise.resolve(false),
  ]);

  let providerSpare: number | null = null;
  let reserve = 0;
  if (routerEnabled()) {
    const h = quotaHeadroom(await getProviderCards(now));
    providerSpare = h.spare;
    reserve = h.reserve;
  }

  return { ...combineBudget({ paused, dailyCap, sentToday, providerSpare, reserve }), sentToday, dailyCap, providerSpare, reserve };
}
