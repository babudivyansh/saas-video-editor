// Subscription term arithmetic, shared by the recurring charge handler
// (lib/fulfillment.ts fulfillSubscriptionCharge) and the refill cron, so the
// two can never disagree about when a paid term ends or when its next monthly
// refill is due.
//
// A recurring charge pays for the plan's whole interval — one month for a
// monthly plan, twelve for an annual one (lib/billing/razorpay-plans.ts syncs
// every non-monthly plan as a Razorpay `yearly` plan). Credits still arrive a
// month at a time: the first month with the charge, the rest via the refill
// cron at nextRefillAt.

/** Slack after a recurring term so a slow or retried renewal doesn't cut
 *  access. Access runs to paidUntil + this; refills never enter it. */
export const RENEWAL_GRACE_DAYS = 3;

export function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d;
}

export interface RecurringTerm {
  /** When the next charge is due — the end of what this charge paid for. */
  paidUntil: Date;
  /** subscriptionEndsAt: paidUntil plus the renewal grace. */
  accessUntil: Date;
  /** First monthly refill, for multi-month terms; null for a monthly plan
   *  (its next credits come with its next charge). */
  nextRefillAt: Date | null;
}

export function recurringTerm(chargedAt: Date, intervalMonths: number | null | undefined): RecurringTerm {
  const months = Math.max(1, intervalMonths ?? 1);
  const paidUntil = addMonths(chargedAt, months);
  const accessUntil = new Date(paidUntil.getTime() + RENEWAL_GRACE_DAYS * 86_400_000);
  return { paidUntil, accessUntil, nextRefillAt: months > 1 ? addMonths(chargedAt, 1) : null };
}

/**
 * The refill after `current`, or null once it would reach the end of the paid
 * term. For a recurring subscription that end is subscriptionEndsAt MINUS the
 * renewal grace: the refill that would land on the renewal date belongs to
 * the renewal charge, and granting it here too would pay month 13 twice.
 */
export function nextRefillAfter(current: Date, subscriptionEndsAt: Date | null, recurring: boolean): Date | null {
  const next = addMonths(current, 1);
  if (!subscriptionEndsAt) return next;
  const paidUntil = recurring
    ? new Date(subscriptionEndsAt.getTime() - RENEWAL_GRACE_DAYS * 86_400_000)
    : subscriptionEndsAt;
  return next >= paidUntil ? null : next;
}
