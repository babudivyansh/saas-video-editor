// Classifying errors thrown by the Razorpay Node SDK, which rejects with
// `{ statusCode, error: { code, description, field, ... } }` rather than an
// Error instance.

interface RazorpaySdkError {
  statusCode?: number;
  error?: { code?: string; description?: string; field?: string | null };
}

/**
 * True when Razorpay rejected a request because the plan id it was given does
 * not exist for these API keys.
 *
 * The case that matters: Razorpay test mode and live mode are separate worlds,
 * each with its own Plans. A Plan.razorpayPlanId{Inr,Usd} minted while the
 * deployment ran on one set of keys is unknown to the other, so after switching
 * between test and live every subscription checkout failed with a bare 502 —
 * and nothing re-minted the plan, because an id WAS stored.
 */
export function isMissingRazorpayPlan(e: unknown): boolean {
  const err = (e ?? {}) as RazorpaySdkError;
  if (err.statusCode !== 400 && err.statusCode !== 404) return false;
  const field = err.error?.field ?? "";
  const description = err.error?.description ?? "";
  if (field === "offer_id") return false;
  // Razorpay words an unknown id two ways: "The id provided does not exist" and
  // "The ID provided is invalid or could not be found" (CLIPIRO-WEB-S — the
  // second never matched, so checkout 502'd instead of re-minting the plan).
  // Callers only reach this after any offer has been ruled out, so a bare
  // "id provided" here is the plan's.
  return (
    field === "plan_id" ||
    /id provided (does not exist|is invalid|could not be found)|plan.*(does not exist|not found|invalid)/i.test(description)
  );
}

/** Loggable one-liner for an SDK rejection. */
export function describeRazorpayError(e: unknown): string {
  const err = (e ?? {}) as RazorpaySdkError;
  if (err.error?.description) {
    return `${err.statusCode ?? "?"} ${err.error.code ?? ""} ${err.error.description}${err.error.field ? ` (field: ${err.error.field})` : ""}`.trim();
  }
  return e instanceof Error ? e.message : String(e);
}
