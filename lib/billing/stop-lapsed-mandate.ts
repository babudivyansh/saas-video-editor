// Stopping the Razorpay mandate of a subscription the refill cron is lapsing.
//
// The cron used to call subscriptions.cancel() and treat anything but a
// recognisable "already gone" error as a failure, leaving the user linked and
// retrying the next night. The Razorpay SDK rejects with a plain object, not an
// Error, so the check ran against "[object Object]" and never matched: one
// subscription retried — and paged Sentry — every night for 13 days
// (CLIPIRO-WEB-N), without ever logging what Razorpay actually said.
//
// Now the subscription is looked up first. Nothing is left to stop when it
//  • is already cancelled / completed / expired,
//  • is still "created" (the customer never authorised a mandate), or
//  • doesn't exist for these API keys (an id minted on test keys, now on live).
// Otherwise it is cancelled immediately; a failure there is real and is
// reported with Razorpay's own description.

import type Razorpay from "razorpay";
import { describeRazorpayError } from "./razorpay-errors";

const NOTHING_TO_STOP = new Set(["cancelled", "completed", "expired", "created"]);

interface SdkError {
  statusCode?: number;
  error?: { description?: string };
}

/** True when Razorpay says the id doesn't exist for these keys. */
export function isUnknownRazorpayId(e: unknown): boolean {
  const err = (e ?? {}) as SdkError;
  if (err.statusCode !== 400 && err.statusCode !== 404) return false;
  return /id provided (does not exist|is invalid|could not be found)|not found/i.test(err.error?.description ?? "");
}

export type StopMandateResult =
  | { ok: true; outcome: "cancelled" | "already-stopped" | "unknown-id"; status?: string }
  | { ok: false; error: string };

export async function stopLapsedMandate(
  razorpay: Pick<Razorpay, "subscriptions">,
  subscriptionId: string,
): Promise<StopMandateResult> {
  let status: string | undefined;
  try {
    const sub = (await razorpay.subscriptions.fetch(subscriptionId)) as { status?: string };
    status = sub.status;
  } catch (e) {
    if (isUnknownRazorpayId(e)) return { ok: true, outcome: "unknown-id" };
    return { ok: false, error: `fetch failed: ${describeRazorpayError(e)}` };
  }
  if (status && NOTHING_TO_STOP.has(status)) return { ok: true, outcome: "already-stopped", status };

  try {
    await razorpay.subscriptions.cancel(subscriptionId, false);
    return { ok: true, outcome: "cancelled", status };
  } catch (e) {
    return { ok: false, error: `cancel failed (status ${status ?? "?"}): ${describeRazorpayError(e)}` };
  }
}
