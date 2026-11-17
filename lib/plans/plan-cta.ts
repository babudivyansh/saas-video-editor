// What a plan card's button says for the person looking at it (in-app plans
// page). A subscriber used to see "Get Pro" on every card and "Renew Studio"
// on the plan they were already paying for, so nothing said which way a click
// moved them.

import { PURCHASABLE_TIER_ORDER, TIER_LABEL, type TierId } from "@/lib/plans/tiers";

interface CtaPlan {
  slug: string;
  tier?: TierId | null;
  intervalMonths?: number | null;
}

export interface PlanCta {
  /** Undefined = the card's default ("Get Pro"). */
  label?: string;
  /** The viewer's live plan: the button is a label, not an action. */
  disabled?: boolean;
}

export function planCta(plan: CtaPlan, current: CtaPlan | null, active: boolean): PlanCta {
  if (!current || !plan.tier || !current.tier || plan.tier === "free" || current.tier === "free") return {};
  const tier = TIER_LABEL[plan.tier];
  if (plan.slug === current.slug) {
    return active ? { label: "Your current plan", disabled: true } : { label: `Renew ${tier}` };
  }
  // A lapsed plan: every other card is a fresh purchase, so the default reads right.
  if (!active) return {};
  if (plan.tier === current.tier) {
    return { label: (plan.intervalMonths ?? 1) > 1 ? "Switch to yearly" : "Switch to monthly" };
  }
  const rank = (t: TierId) => (PURCHASABLE_TIER_ORDER as readonly TierId[]).indexOf(t);
  return { label: rank(plan.tier) > rank(current.tier) ? `Upgrade to ${tier}` : `Switch to ${tier}` };
}
