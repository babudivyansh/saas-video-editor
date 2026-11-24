// One answer to "where does this account stand with billing?", shared by
// Admin → Subscriptions, the Accounts "Billing status" filter (and its CSV
// export) and campaign audiences, so no two screens can count differently.
//
// Built from columns that already exist (lib/billing/trial-status.ts explains
// trialEndsAt): in trial = trialEndsAt in the future; a plan is running when
// subscriptionEndsAt is in the future and a plan is set. A trial also sets
// subscriptionEndsAt, which is why the old Subscriptions page counted trials
// as subscribers.

import type { Prisma } from "@prisma/client";
import type { BillingStatus } from "./billing-status-labels";

export * from "./billing-status-labels";

export interface BillingFields {
  planId: string | null;
  subscriptionEndsAt: Date | null;
  subscriptionCancelledAt: Date | null;
  trialEndsAt: Date | null;
  paymentFailedAt: Date | null;
}

/** Pure form, for one account. `hasPaid`: any captured purchase over zero. */
export function billingStatusOf(u: BillingFields, hasPaid: boolean, now: Date = new Date()): BillingStatus {
  if (u.trialEndsAt && u.trialEndsAt > now) return u.subscriptionCancelledAt ? "trial_cancelled" : "trial";
  const running = !!u.planId && !!u.subscriptionEndsAt && u.subscriptionEndsAt > now;
  if (running) {
    if (u.subscriptionCancelledAt) return "paid_cancelling";
    if (u.paymentFailedAt) return "payment_failed";
    return "paid";
  }
  return hasPaid ? "lapsed" : "free";
}

const PAID_PURCHASE: Prisma.PurchaseWhereInput = { amountInPaise: { gt: 0 }, status: { not: "refunded" } };

/** The same rules as a Prisma filter, so lists and counts can page in the database. */
export function billingStatusWhere(status: BillingStatus, now: Date = new Date()): Prisma.UserWhereInput {
  const inTrial: Prisma.UserWhereInput = { trialEndsAt: { gt: now } };
  const notInTrial: Prisma.UserWhereInput = { OR: [{ trialEndsAt: null }, { trialEndsAt: { lte: now } }] };
  const running: Prisma.UserWhereInput = { planId: { not: null }, subscriptionEndsAt: { gt: now } };
  const notRunning: Prisma.UserWhereInput = {
    OR: [{ planId: null }, { subscriptionEndsAt: null }, { subscriptionEndsAt: { lte: now } }],
  };
  switch (status) {
    case "trial":
      return { AND: [inTrial, { subscriptionCancelledAt: null }] };
    case "trial_cancelled":
      return { AND: [inTrial, { subscriptionCancelledAt: { not: null } }] };
    case "paid":
      return { AND: [notInTrial, running, { subscriptionCancelledAt: null }, { paymentFailedAt: null }] };
    case "paid_cancelling":
      return { AND: [notInTrial, running, { subscriptionCancelledAt: { not: null } }] };
    case "payment_failed":
      return { AND: [notInTrial, running, { subscriptionCancelledAt: null }, { paymentFailedAt: { not: null } }] };
    case "lapsed":
      return { AND: [notInTrial, notRunning, { purchases: { some: PAID_PURCHASE } }] };
    case "free":
      return { AND: [notInTrial, notRunning, { purchases: { none: PAID_PURCHASE } }] };
  }
}

/** Anything running: a plan or a trial. */
export function activeBillingWhere(now: Date = new Date()): Prisma.UserWhereInput {
  return {
    OR: [{ trialEndsAt: { gt: now } }, { planId: { not: null }, subscriptionEndsAt: { gt: now } }],
  };
}
