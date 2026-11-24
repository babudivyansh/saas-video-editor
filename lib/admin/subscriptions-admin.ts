// Queries behind Admin → Subscriptions: who has a plan or trial running right
// now (by billing status), and every trial with its outcome. The list route
// and its CSV export share these, so the file always matches the screen.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ACTIVE_BILLING_STATUSES, activeBillingWhere, billingStatusOf, billingStatusWhere, cancelReasonLabel,
  type BillingStatus, type TrialOutcome,
} from "@/lib/billing/billing-status";
import { listTrials, summariseTrials, trialsByWeek, type TrialRow, type TrialWeek } from "@/lib/billing/trial-history";

export type ActiveStatus = (typeof ACTIVE_BILLING_STATUSES)[number];

function searchWhere(search?: string): Prisma.UserWhereInput {
  return search
    ? { OR: [{ email: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] }
    : {};
}

const SUBSCRIBER_SELECT = {
  id: true,
  email: true,
  name: true,
  credits: true,
  monthlyCredits: true,
  minutes: true,
  monthlyMinutes: true,
  subscriptionEndsAt: true,
  subscriptionCancelledAt: true,
  trialEndsAt: true,
  paymentFailedAt: true,
  nextRefillAt: true,
  planId: true,
  razorpaySubscriptionId: true,
  plan: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.UserSelect;

export interface SubscriberRow {
  id: string;
  email: string;
  name: string | null;
  plan: { id: string; name: string; slug: string } | null;
  billingStatus: BillingStatus;
  credits: number;
  monthlyCredits: number;
  minutes: number;
  monthlyMinutes: number;
  subscriptionEndsAt: string | null;
  trialEndsAt: string | null;
  nextRefillAt: string | null;
  cancelledAt: string | null;
  /** For a cancelled renewal or trial: done in Clipiro, or only seen by Razorpay (mandate revoked). */
  cancelSource: "in_app" | "external" | null;
  cancelDetail: string | null;
  paymentFailedAt: string | null;
  recurring: boolean;
}

export async function listSubscribers(opts: {
  status?: ActiveStatus;
  search?: string;
  page: number;
  limit: number;
  now?: Date;
}): Promise<{ rows: SubscriberRow[]; total: number }> {
  const now = opts.now ?? new Date();
  const where: Prisma.UserWhereInput = {
    AND: [opts.status ? billingStatusWhere(opts.status, now) : activeBillingWhere(now), searchWhere(opts.search)],
  };
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      // Soonest to end first: what needs attention.
      orderBy: { subscriptionEndsAt: "asc" },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
      select: SUBSCRIBER_SELECT,
    }),
    prisma.user.count({ where }),
  ]);

  // How each cancelled account was cancelled: an in-app path always writes a
  // "cancelled" event with a reason; Razorpay's webhook writes one without.
  const cancelledSubs = users.filter((u) => u.subscriptionCancelledAt && u.razorpaySubscriptionId).map((u) => u.razorpaySubscriptionId!);
  const cancelEvents = cancelledSubs.length
    ? await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: { in: cancelledSubs }, type: "cancelled" },
        select: { subscriptionId: true, reason: true },
      })
    : [];

  const rows = users.map((u): SubscriberRow => {
    let cancelSource: SubscriberRow["cancelSource"] = null;
    let cancelDetail: string | null = null;
    if (u.subscriptionCancelledAt) {
      const evs = cancelEvents.filter((e) => e.subscriptionId === u.razorpaySubscriptionId);
      const inApp = evs.find((e) => e.reason);
      if (inApp) {
        cancelSource = "in_app";
        cancelDetail = cancelReasonLabel(inApp.reason);
      } else if (evs.length) {
        cancelSource = "external";
      } else {
        // Prepaid / admin-granted plans have no Razorpay subscription: only Clipiro can cancel them.
        cancelSource = "in_app";
      }
    }
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      plan: u.plan,
      // Only running accounts are listed, so "lapsed" and "free" can't occur.
      billingStatus: billingStatusOf(u, true, now),
      credits: u.credits,
      monthlyCredits: u.monthlyCredits,
      minutes: u.minutes,
      monthlyMinutes: u.monthlyMinutes,
      subscriptionEndsAt: u.subscriptionEndsAt?.toISOString() ?? null,
      trialEndsAt: u.trialEndsAt && u.trialEndsAt > now ? u.trialEndsAt.toISOString() : null,
      nextRefillAt: u.nextRefillAt?.toISOString() ?? null,
      cancelledAt: u.subscriptionCancelledAt?.toISOString() ?? null,
      cancelSource,
      cancelDetail,
      paymentFailedAt: u.paymentFailedAt?.toISOString() ?? null,
      recurring: !!u.razorpaySubscriptionId,
    };
  });
  return { rows, total };
}

/** Accounts in each running status right now. */
export async function countActiveStatuses(now: Date = new Date()): Promise<Record<ActiveStatus, number>> {
  const counts = await Promise.all(ACTIVE_BILLING_STATUSES.map((s) => prisma.user.count({ where: billingStatusWhere(s, now) })));
  return Object.fromEntries(ACTIVE_BILLING_STATUSES.map((s, i) => [s, counts[i]])) as Record<ActiveStatus, number>;
}

export interface TrialListResult {
  rows: TrialRow[];
  total: number;
  summary: ReturnType<typeof summariseTrials>;
  /** Last 12 weeks of trial starts by outcome (all trials, ignoring filters). */
  weeks: TrialWeek[];
}

export async function listTrialsFiltered(opts: {
  outcome?: TrialOutcome;
  search?: string;
  page: number;
  limit: number;
  now?: Date;
}): Promise<TrialListResult> {
  const now = opts.now ?? new Date();
  const all = await listTrials(now);
  const summary = summariseTrials(all);
  const q = opts.search?.toLowerCase();
  const filtered = all.filter(
    (t) => (!opts.outcome || t.outcome === opts.outcome) && (!q || t.email.toLowerCase().includes(q) || (t.name ?? "").toLowerCase().includes(q)),
  );
  const start = (opts.page - 1) * opts.limit;
  return { rows: filtered.slice(start, start + opts.limit), total: filtered.length, summary, weeks: trialsByWeek(all, 12, now) };
}
