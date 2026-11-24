// Billing statuses and trial outcomes: names and labels only, client-safe.
// The rules that decide them live in lib/billing/billing-status.ts.

/**
 * Where an account stands right now. Every account is in exactly one.
 *   paid             paying (or admin-granted) plan, renewing
 *   paid_cancelling  plan still running, renewal cancelled
 *   payment_failed   plan still running, last renewal charge failed
 *   trial            in the free trial, will be charged when it ends
 *   trial_cancelled  in the free trial, cancelled (in the app, or the
 *                    mandate was revoked at the bank / UPI app): never charged
 *   lapsed           paid at some point, nothing active now
 *   free             never paid, nothing active
 */
export const BILLING_STATUSES = ["paid", "paid_cancelling", "payment_failed", "trial", "trial_cancelled", "lapsed", "free"] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

/** The statuses with something running (plan or trial). */
export const ACTIVE_BILLING_STATUSES = ["paid", "paid_cancelling", "payment_failed", "trial", "trial_cancelled"] as const satisfies readonly BillingStatus[];

export const BILLING_STATUS_LABEL: Record<BillingStatus, string> = {
  paid: "Paying",
  paid_cancelling: "Paying, cancelled renewal",
  payment_failed: "Payment failed",
  trial: "In trial",
  trial_cancelled: "Trial cancelled",
  lapsed: "Lapsed (paid before)",
  free: "Free (never paid)",
};

/**
 * What became of one free trial.
 *   active            still running, will be charged at the end
 *   converted         the first charge went through
 *   cancelled_in_app  cancelled from Clipiro (by the customer or an admin)
 *   mandate_revoked   cancelled outside Clipiro: the customer revoked the
 *                     card / UPI AutoPay mandate at their bank or UPI app (or
 *                     it was cancelled on the Razorpay dashboard)
 *   payment_failed    the first charge failed
 *   ended             over, with no charge or cancellation on record
 */
export const TRIAL_OUTCOMES = ["active", "converted", "cancelled_in_app", "mandate_revoked", "payment_failed", "ended"] as const;
export type TrialOutcome = (typeof TRIAL_OUTCOMES)[number];

export const TRIAL_OUTCOME_LABEL: Record<TrialOutcome, string> = {
  active: "In trial",
  converted: "Converted",
  cancelled_in_app: "Cancelled in app",
  mandate_revoked: "Mandate revoked (bank / UPI)",
  payment_failed: "First charge failed",
  ended: "Ended, not charged",
};

/** "user_requested_trial" → "customer"; the reasons cancel-subscription and friends write. */
export function cancelReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const base = reason.replace(/_trial$/, "");
  const map: Record<string, string> = {
    user_requested: "by the customer",
    admin_requested: "by an admin",
    refunded: "refunded",
    account_deactivate: "account deactivated",
    plan_switch: "switched plan",
  };
  return map[base] ?? base.replace(/_/g, " ");
}
