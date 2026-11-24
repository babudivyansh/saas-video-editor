// Black Friday 2026 — one source of truth for the dates, the bonus maths and
// who qualifies. No price changes anywhere: the offer is extra Clip Minutes.
//
//   A. Minute packs: every `minute_pack` order placed in the window grants 2×
//      its minutes. The bonus (100% of the pack) goes into the same
//      never-expiring purchased bucket as the pack itself. INR and USD, no
//      purchase limit. AI credit packs are NOT included.
//
//   B. Plans: a NEW subscription (Creator / Pro / Agency, monthly or yearly,
//      INR or USD) started in the window gets a one-time bonus of one month's
//      Clip Minutes on its first paid charge, so month 1 is doubled. AI credits
//      are not doubled. Once per account; upgrades and renewals of a plan that
//      is already running don't qualify.
//
// The window is judged at checkout and stamped on the Razorpay order /
// subscription notes (server-set, so trusted — api/billing/verify re-reads
// them from Razorpay). That way a Pro trial started on 30 Nov, whose first
// charge lands on 3 Dec, still gets its bonus. A trial that started BEFORE the
// window carries no stamp; its first charge counts as "subscribing" and earns
// the bonus when that charge itself lands inside the window (see
// bfPlanBonusEligibleAtCharge) — that is what the trial banner promises.
//
// Both grants are written with dedicated ledger reasons, which are also the
// idempotency guards: the pack bonus once per payment, the plan bonus once per
// account.

export const BLACK_FRIDAY = {
  /** 24 Nov 2026, 5:00 PM IST (moved up from 26 Nov 00:00 on 24 Nov). */
  startsAt: Date.parse("2026-11-24T17:00:00+05:30"),
  /** 30 Nov 2026 (Cyber Monday), 23:59:59 IST. */
  endsAt: Date.parse("2026-11-30T23:59:59+05:30"),
  /** Pack minutes multiplier, as a bonus percentage of the pack's minutes. */
  packBonusPct: 100,
  /** Plan bonus, as a percentage of the plan's monthly Clip Minutes. */
  planBonusPct: 100,
  /** Campaign label stamped on notes / shown on banners. Not a coupon. */
  code: "BF26",
  endLabel: "30 Nov",
  endLabelLong: "30 Nov 2026, 11:59 PM IST",
} as const;

export type BlackFridayPhase = "before" | "live" | "over";

export function blackFridayPhase(now: number = Date.now()): BlackFridayPhase {
  if (now < BLACK_FRIDAY.startsAt) return "before";
  if (now <= BLACK_FRIDAY.endsAt) return "live";
  return "over";
}

export function isBlackFridayLive(now: number = Date.now()): boolean {
  return blackFridayPhase(now) === "live";
}

// ── Ledger reasons (also the idempotency guards) ────────────────────────────

/** Minute-pack bonus. One per payment (refId = payment id). */
export const BF26_PACK_BONUS_REASON = "grant:bf26-pack-bonus";
/** First-month plan bonus. One per account. */
export const BF26_PLAN_BONUS_REASON = "grant:bf26-plan-bonus";

// ── Checkout stamps (Razorpay notes values, key `bf26`) ─────────────────────

export const BF26_NOTE_KEY = "bf26";
export const BF26_PACK_NOTE = "pack";
export const BF26_PLAN_NOTE = "plan";

// ── A. Minute packs ─────────────────────────────────────────────────────────

/** Whether a checkout of this plan kind, started now, gets the pack bonus.
 *  Only Clip Minutes packs — AI credit packs ("pack") are excluded. */
export function bfPackBonusApplies(kind: string, now: number = Date.now()): boolean {
  return kind === "minute_pack" && isBlackFridayLive(now);
}

/** The bonus minutes for a pack of `packMinutes` (2× total). */
export function bfPackBonus(packMinutes: number): number {
  if (!Number.isFinite(packMinutes) || packMinutes <= 0) return 0;
  return Math.ceil((packMinutes * BLACK_FRIDAY.packBonusPct) / 100);
}

// ── B. Plans ────────────────────────────────────────────────────────────────

export interface BfPlanCheckoutArgs {
  /** Plan.kind — only "subscription" qualifies. */
  kind: string;
  /** The buyer's current plan state at checkout. */
  subscriptionEndsAt: Date | null | undefined;
  /** Set while a Pro trial is running (never paid yet). */
  trialEndsAt: Date | null | undefined;
}

/** True when the account already has a PAID plan running — buying another
 *  plan now is an upgrade/switch, not a new subscription. A running trial is
 *  not a paid plan: converting or replacing it is the account's first plan. */
export function hasRunningPaidPlan(
  args: Pick<BfPlanCheckoutArgs, "subscriptionEndsAt" | "trialEndsAt">,
  now: number = Date.now(),
): boolean {
  if (args.trialEndsAt) return false;
  return !!args.subscriptionEndsAt && args.subscriptionEndsAt.getTime() > now;
}

/** Whether a plan checkout started now should be stamped for the first-month
 *  bonus. Monthly or yearly, INR or USD, trial or not. */
export function bfPlanBonusAppliesAtCheckout(args: BfPlanCheckoutArgs, now: number = Date.now()): boolean {
  return args.kind === "subscription" && isBlackFridayLive(now) && !hasRunningPaidPlan(args, now);
}

export interface BfPlanChargeArgs {
  /** `notes.bf26` from the subscription / order. */
  note: string | null | undefined;
  /** The user's trialEndsAt at the moment the charge arrives (non-null = this
   *  charge converts a trial — the account's first paid charge). */
  trialEndsAt: Date | null | undefined;
}

/** Whether THIS charge earns the plan bonus, before the once-per-account
 *  ledger check. Stamped at checkout → yes, whenever the charge lands.
 *  Unstamped → only a trial converting inside the window (a trial started
 *  before the sale opened whose owner kept it running). */
export function bfPlanBonusEligibleAtCharge(args: BfPlanChargeArgs, now: number = Date.now()): boolean {
  if (args.note === BF26_PLAN_NOTE) return true;
  return !!args.trialEndsAt && isBlackFridayLive(now);
}

/** The first-month bonus: one month's Clip Minutes (AI credits not doubled). */
export function bfPlanBonus(monthlyMinutes: number): number {
  if (!Number.isFinite(monthlyMinutes) || monthlyMinutes <= 0) return 0;
  return Math.ceil((monthlyMinutes * BLACK_FRIDAY.planBonusPct) / 100);
}
