"use client";

import { useBillingOverlay } from "@/app/components/billing/BillingOverlayContext";

/**
 * What a locked caption template does when picked: open the plans view of
 * the billing overlay, or go to /pricing where there is no overlay (the hook
 * throws outside its provider, e.g. in isolated component tests).
 */
export function useUpgradePrompt(): () => void {
  let open: (() => void) | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- always called; only the throw is caught
    const { openBilling } = useBillingOverlay();
    open = () => openBilling({ view: "plans" });
  } catch {
    open = null;
  }
  return open ?? (() => { window.location.href = "/pricing"; });
}
