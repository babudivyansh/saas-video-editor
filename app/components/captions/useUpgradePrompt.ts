"use client";

import { useOpenPlans } from "@/app/components/billing/BillingOverlayContext";

/**
 * What a locked caption template does when picked: open the in-app plans page
 * (see useOpenPlans — it also works outside the billing provider, e.g. in
 * isolated component tests, by navigating to the dashboard deep link).
 */
export function useUpgradePrompt(): () => void {
  return useOpenPlans();
}
