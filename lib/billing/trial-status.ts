// Is this account in its 7-day free trial right now? One answer, shared by the
// billing overview, Manage Subscription, the header chip and the post-checkout
// banner, so no two screens can disagree. Client-safe.
//
// trialEndsAt is set when the mandate is authenticated (lib/billing/trial.ts)
// and cleared when the first real charge activates the subscription, so "in
// trial" is simply "trialEndsAt is still in the future".

export interface TrialFields {
  trialEndsAt?: string | Date | null;
  subscriptionCancelledAt?: string | Date | null;
}

export interface TrialStatus {
  /** When the trial ends — and, unless cancelled, the first charge is taken. */
  endsAt: Date;
  /** Whole days left, rounded up; 0 on the last day. */
  daysLeft: number;
  /** Cancelled during the trial: nothing will ever be charged. */
  cancelled: boolean;
}

export function trialStatus(account: TrialFields | null | undefined, now: Date = new Date()): TrialStatus | null {
  if (!account?.trialEndsAt) return null;
  const endsAt = new Date(account.trialEndsAt);
  if (!(endsAt > now)) return null;
  return {
    endsAt,
    daysLeft: Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000)),
    cancelled: !!account.subscriptionCancelledAt,
  };
}

/** "3 days left", "1 day left", "Ends today". */
export function trialDaysLeftLabel(daysLeft: number): string {
  if (daysLeft <= 0) return "Ends today";
  return `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
}
