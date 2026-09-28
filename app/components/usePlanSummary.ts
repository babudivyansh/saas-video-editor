"use client";

// One derivation of "what plan am I on and how much is left", shared by the
// sidebar's plan card (xl and up) and the header's compact pill (below xl).
// Both used to compute this inline in DashboardHeader.

import { useTranslations } from "next-intl";
import { useAuth } from "@/app/components/AuthContext";
import { effectivePlan, planDisplayName } from "@/lib/plans/effective-plan";
import { FREE_TIER_MONTHLY_BONUS_MINUTES, isLowMinutes } from "@/lib/plans/tiers";
import { trialStatus } from "@/lib/billing/trial-status";

export function usePlanSummary() {
  const { user } = useAuth();
  const t = useTranslations("Nav");

  // Same helper the server gates entitlements with, so the UI can never say
  // one thing while getUserTier says another.
  const hasActivePlan = effectivePlan(user).isActive;
  // Free accounts measure against the free monthly grant.
  const minutesAllowance = hasActivePlan ? (user?.monthlyMinutes ?? 0) : FREE_TIER_MONTHLY_BONUS_MINUTES;
  const minutes = user?.minutes ?? 0;
  const credits = user?.credits ?? 0;
  // Amber at ~20% of the month's Clip Minutes — the line the low-minutes email fires at.
  const minutesLow = !!user && isLowMinutes(minutes, minutesAllowance);
  const basePlanName = planDisplayName(user, { free: t("freePlanFallback"), activeFallback: t("proPlanFallback") });
  // A trial must be visible at a glance, not read as a plain paid plan.
  const planName = trialStatus(user) ? `${basePlanName} · Trial` : basePlanName;
  // Share of this month's minutes still available; top-ups can push the
  // balance past the allowance, so it is capped for the bar.
  const minutesPct = minutesAllowance > 0 ? Math.min(100, Math.round((minutes / minutesAllowance) * 100)) : 0;

  return { user, hasActivePlan, planName, minutes, minutesAllowance, minutesPct, minutesLow, credits };
}
