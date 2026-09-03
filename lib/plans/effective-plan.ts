import type { TierId } from "@/lib/plans/tiers";

// One definition of "what plan is this account actually on".
//
// There used to be three, and they disagreed:
//
//   1. getUserTier (lib/auth.ts) and an inline copy of it in /api/auth/me —
//      both required an unexpired subscriptionEndsAt AND a plan.tier.
//   2. The dashboard header — plan.name, gated on subscriptionEndsAt only.
//   3. The admin users list and the settings tile — plan.name with NO expiry
//      check at all.
//
// So an account with planId set and subscriptionEndsAt null read as "Creator"
// in the admin panel and on the settings page, and as "Free" in the header and
// in every server-side entitlement check. That is not a hypothetical: it is
// exactly how an admin-assigned plan silently failed to reach a user's
// dashboard, and because the admin surface was the one ignoring expiry, the
// admin had no way to see it.
//
// This module is deliberately pure and dependency-free so both the server
// (Prisma rows) and the client (the /api/auth/me payload) can call it.

/** The plan fields this helper needs. Structural, so a Prisma row, a selected
 *  subset, or the serialized client shape all satisfy it. */
export interface PlanLike {
  name?: string | null;
  /** "creator" | "pro" | "studio". Null on packs and addons, which are credit
   *  grants rather than entitlements — and, unfortunately, also possible on a
   *  misconfigured subscription row, since Plan.tier is nullable. */
  tier?: string | null;
}

export interface AccountPlanState {
  plan?: PlanLike | null;
  /** Null means no subscription term at all. Accepts a Date (Prisma) or an ISO
   *  string (the client payload). */
  subscriptionEndsAt?: Date | string | null;
}

export interface EffectivePlan {
  /** The tier every entitlement check should gate on. */
  tier: TierId;
  /** True when the account has an unexpired subscription term. */
  isActive: boolean;
  /**
   * True when a plan is attached but its term is missing or past. This is the
   * state that used to be invisible — surfaces that show a plan name must mark
   * it, or an expired account looks identical to a paying one.
   */
  isExpired: boolean;
  /** Plan name when the term is live, else null. Never a fabricated label. */
  activePlanName: string | null;
  /**
   * The plan name to show alongside an expired marker. Set only when
   * `isExpired`, so a caller can render "Creator · expired" without having to
   * reach back into the raw row.
   */
  expiredPlanName: string | null;
}

/** Accepts Date | string | null and answers whether the term is still running. */
function isTermActive(endsAt: Date | string | null | undefined): boolean {
  if (!endsAt) return false;
  const ts = endsAt instanceof Date ? endsAt.getTime() : Date.parse(endsAt);
  return Number.isFinite(ts) && ts > Date.now();
}

/**
 * Resolve an account's effective plan.
 *
 * `tier` falls back to "free" for a missing plan, an expired term, or a plan
 * row with no tier — "free" is a sentinel, never a purchasable Plan row.
 * Note that a null `plan.tier` on a live subscription yields tier "free" while
 * `isActive` stays true: the term is genuinely running, the plan row is just
 * misconfigured. Callers that gate on entitlement read `tier`; callers that
 * describe the subscription read `isActive`.
 */
export function effectivePlan(account: AccountPlanState | null | undefined): EffectivePlan {
  const plan = account?.plan ?? null;
  const isActive = isTermActive(account?.subscriptionEndsAt);
  const hasPlan = !!plan;
  const name = plan?.name?.trim() || null;

  return {
    tier: isActive && plan?.tier ? (plan.tier as TierId) : "free",
    isActive,
    isExpired: hasPlan && !isActive,
    activePlanName: isActive ? name : null,
    expiredPlanName: hasPlan && !isActive ? name : null,
  };
}

/**
 * The label a user-facing surface should show for their plan.
 *
 * `freeLabel` is passed in rather than hardcoded because the dashboard is
 * localised (messages/en.json `Nav.freePlanFallback`) and this module is not.
 * `activeFallback` covers a live term whose plan row is missing — previously
 * the header's `proPlanFallback`.
 */
export function planDisplayName(
  account: AccountPlanState | null | undefined,
  labels: { free: string; activeFallback?: string },
): string {
  const state = effectivePlan(account);
  if (!state.isActive) return labels.free;
  return state.activePlanName ?? labels.activeFallback ?? labels.free;
}
