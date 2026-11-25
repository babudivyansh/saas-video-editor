// Every free trial that was started, and what became of it.
//
// A trial is a SubscriptionEvent "trial_started" (written when the customer
// approves the mandate, lib/billing/trial.ts). Its outcome comes from the
// later events on the same Razorpay subscription:
//   activated / charged          → the first charge went through
//   cancelled with a reason      → cancelled from Clipiro (lib/billing/cancel-subscription.ts
//                                   and friends always write a reason)
//   cancelled with no reason     → only the Razorpay webhook saw it: the customer revoked
//                                   the mandate at their bank / UPI app (or it was cancelled
//                                   on the Razorpay dashboard)
//   halted / payment_failed      → the first charge failed
//
// "activated" was only recorded from 2026-11-24, so for older trials a paid
// purchase on the same subscription after the trial started also counts.

import { prisma } from "@/lib/prisma";
import { TRIAL_DAYS } from "@/lib/plans/tiers";
import { cancelReasonLabel, type TrialOutcome } from "./billing-status-labels";

const DAY_MS = 86_400_000;
const MAX_TRIALS = 5000;

export interface TrialEventLite {
  type: string;
  reason: string | null;
  createdAt: Date;
}

export interface TrialOutcomeResult {
  outcome: TrialOutcome;
  /** When the outcome happened (charge / cancel / failure); null while active or ended. */
  at: Date | null;
  /** Human cancel reason for in-app cancellations. */
  detail: string | null;
}

/** Pure: the outcome of one trial from its subscription's events. */
export function trialOutcome(input: {
  events: TrialEventLite[];
  endsAt: Date;
  /** A paid purchase on this subscription after the trial started (pre-"activated" fallback). */
  paidAfterStart: Date | null;
  now?: Date;
}): TrialOutcomeResult {
  const now = input.now ?? new Date();
  const sorted = [...input.events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const charge = sorted.find((e) => e.type === "activated" || e.type === "charged");
  const cancels = sorted.filter((e) => e.type === "cancelled");
  const firstCancel = cancels[0];

  if (charge && (!firstCancel || charge.createdAt <= firstCancel.createdAt)) {
    return { outcome: "converted", at: charge.createdAt, detail: null };
  }
  if (firstCancel) {
    const inApp = cancels.find((e) => e.reason);
    return inApp
      ? { outcome: "cancelled_in_app", at: inApp.createdAt, detail: cancelReasonLabel(inApp.reason) }
      : { outcome: "mandate_revoked", at: firstCancel.createdAt, detail: null };
  }
  const failed = sorted.find((e) => e.type === "halted" || e.type === "payment_failed");
  if (failed) return { outcome: "payment_failed", at: failed.createdAt, detail: failed.reason };
  if (input.paidAfterStart) return { outcome: "converted", at: input.paidAfterStart, detail: null };
  if (input.endsAt > now) return { outcome: "active", at: null, detail: null };
  return { outcome: "ended", at: null, detail: null };
}

export interface TrialRow {
  userId: string;
  email: string;
  name: string | null;
  subscriptionId: string;
  startedAt: Date;
  endsAt: Date;
  /** True when endsAt is start + the current trial length, not a stored date. */
  endsAtEstimated: boolean;
  outcome: TrialOutcome;
  outcomeAt: Date | null;
  detail: string | null;
}

/** All trials (newest first, up to 5,000) with their outcomes. */
export async function listTrials(now: Date = new Date()): Promise<TrialRow[]> {
  const starts = await prisma.subscriptionEvent.findMany({
    where: { type: "trial_started" },
    orderBy: { createdAt: "desc" },
    take: MAX_TRIALS,
    select: {
      userId: true,
      subscriptionId: true,
      createdAt: true,
      user: { select: { email: true, name: true, trialEndsAt: true, razorpaySubscriptionId: true } },
    },
  });
  if (starts.length === 0) return [];

  const subIds = [...new Set(starts.map((s) => s.subscriptionId))];
  const userIds = [...new Set(starts.map((s) => s.userId))];
  const [events, purchases] = await Promise.all([
    prisma.subscriptionEvent.findMany({
      where: { subscriptionId: { in: subIds }, type: { in: ["activated", "charged", "cancelled", "halted", "payment_failed"] } },
      select: { subscriptionId: true, type: true, reason: true, createdAt: true },
    }),
    prisma.purchase.findMany({
      where: { userId: { in: userIds }, amountInPaise: { gt: 0 }, status: { not: "refunded" } },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const bySub = new Map<string, TrialEventLite[]>();
  for (const e of events) {
    const list = bySub.get(e.subscriptionId) ?? [];
    list.push(e);
    bySub.set(e.subscriptionId, list);
  }

  return starts.map((s) => {
    const current = s.user.razorpaySubscriptionId === s.subscriptionId;
    const storedEnd = current && s.user.trialEndsAt ? s.user.trialEndsAt : null;
    const endsAt = storedEnd ?? new Date(s.createdAt.getTime() + TRIAL_DAYS * DAY_MS);
    // Fallback only for the subscription still on the account: a later pack
    // purchase after a cancelled trial must not read as a conversion.
    const paidAfterStart = current
      ? (purchases.find((p) => p.userId === s.userId && p.createdAt >= s.createdAt)?.createdAt ?? null)
      : null;
    const o = trialOutcome({ events: bySub.get(s.subscriptionId) ?? [], endsAt, paidAfterStart, now });
    return {
      userId: s.userId,
      email: s.user.email,
      name: s.user.name,
      subscriptionId: s.subscriptionId,
      startedAt: s.createdAt,
      endsAt,
      endsAtEstimated: !storedEnd,
      outcome: o.outcome,
      outcomeAt: o.at,
      detail: o.detail,
    };
  });
}

/** Counts per outcome and the conversion rate among trials that have finished. */
export function summariseTrials(rows: Pick<TrialRow, "outcome">[]) {
  const counts = Object.fromEntries(
    (["active", "converted", "cancelled_in_app", "mandate_revoked", "payment_failed", "ended"] as const).map((o) => [o, 0]),
  ) as Record<TrialOutcome, number>;
  for (const r of rows) counts[r.outcome]++;
  const finished = rows.length - counts.active;
  return {
    total: rows.length,
    counts,
    conversionRate: finished > 0 ? counts.converted / finished : null,
  };
}

export type TrialWeek = { week: string; weekStart: string } & Record<TrialOutcome, number>;

const OUTCOME_KEYS = ["active", "converted", "cancelled_in_app", "mandate_revoked", "payment_failed", "ended"] as const;

/** Monday 00:00 UTC of the week containing d. */
function weekStartUtc(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

/**
 * Trials started per week for the last `weeks` weeks (oldest first, empty
 * weeks included), each split by what became of them. A week's bar is its
 * starts; the colours show the outcomes so far.
 */
export function trialsByWeek(rows: Pick<TrialRow, "startedAt" | "outcome">[], weeks = 12, now: Date = new Date()): TrialWeek[] {
  const thisWeek = weekStartUtc(now);
  const out: TrialWeek[] = [];
  const index = new Map<number, TrialWeek>();
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisWeek.getTime() - i * 7 * DAY_MS);
    const row = {
      week: start.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }),
      weekStart: start.toISOString(),
      ...Object.fromEntries(OUTCOME_KEYS.map((k) => [k, 0])),
    } as TrialWeek;
    out.push(row);
    index.set(start.getTime(), row);
  }
  for (const r of rows) {
    const bucket = index.get(weekStartUtc(r.startedAt).getTime());
    if (bucket) bucket[r.outcome]++;
  }
  return out;
}
