"use client";

// App-wide billing overlay. Billing used to be its own route (/billing), which
// meant every "Upgrade" or "Top up" click threw away whatever the user was
// doing and navigated away. It's now an overlay any surface can open in place:
//
//   const { openBilling } = useBillingOverlay();
//   openBilling({ tab: "topup" })
//
// Modelled on CreditModalProvider, which is mounted next to this one in
// DashboardShell, so both follow the same shape.
//
// The route still exists as a permanent redirect to /dashboard?billing=1 —
// absolute https://clipiro.com/billing URLs are already in customers' inboxes
// (four email CTAs plus the auto-top-up link) and in Notification rows in the
// database, none of which can be edited retroactively.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { BillingOverlay } from "./BillingOverlay";
import { placementFromSource, type UpgradePlacement } from "@/lib/conversion";

export type BillingTab = "overview" | "usage" | "topup" | "history";
export type BillingView = "billing" | "manage" | "plans";

export interface OpenBillingOptions {
  tab?: BillingTab;
  view?: BillingView;
  /** Pack slug to emphasise in Top Up, from the auto-top-up email's ?autotopup=. */
  autotopupSlug?: string | null;
  /** Show the post-purchase success banner (?success=1). */
  success?: boolean;
  /** The purchase was a free-trial start (?success=trial) — nothing was
   *  charged, so the banner must not say "Payment successful". */
  trialStarted?: boolean;
  /** Open the plans view straight onto one offer: the Pro trial's ₹0 checkout,
   *  or a pack's Razorpay checkout (packSlug). Falls back to the plain plans
   *  list when the account can't take it (trial used, pack already bought). */
  intent?: "trial" | "pack";
  packSlug?: string;
  /** Which upgrade offer opened this, for the paywall funnel. */
  placement?: UpgradePlacement;
}

export interface BillingOverlayState extends OpenBillingOptions {
  open: boolean;
}

interface BillingOverlayApi {
  openBilling: (opts?: OpenBillingOptions) => void;
  closeBilling: () => void;
  /** True while the overlay is showing — drives sidebar active state, which
   *  used to come from `pathname.startsWith("/billing")`. */
  isBillingOpen: boolean;
}

const Ctx = createContext<BillingOverlayApi | null>(null);

export function useBillingOverlay(): BillingOverlayApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBillingOverlay must be used inside BillingOverlayProvider");
  return ctx;
}

/** Where an "Upgrade" link points when it can't open the overlay in place. */
export const PLANS_HREF = "/dashboard?billing=1&view=plans";

/**
 * Open the plans page in one click, from anywhere. Inside the dashboard it
 * swaps the overlay straight onto the plans view; outside it (a tool page
 * rendered without the shell) it navigates to the dashboard deep link, which
 * opens the same view (a full navigation, so this works without the app
 * router mounted — component tests render these buttons bare). Every Upgrade / See plans / Change plan button uses
 * this, so none of them stops at the billing overview first, and none of them
 * sends a signed-in customer out to the marketing /pricing page.
 */
export function useOpenPlans(placement: UpgradePlacement = "other"): () => void {
  const ctx = useContext(Ctx);
  return useCallback(() => {
    if (ctx) ctx.openBilling({ view: "plans", placement });
    else window.location.assign(`${PLANS_HREF}&src=${placement}`);
  }, [ctx, placement]);
}

/**
 * One click from an upgrade offer to the Pro trial's "₹0 due today" checkout
 * (or to a pack's checkout with `{ packSlug }`), instead of the plans list and
 * a second choice. Same fallback outside the dashboard as useOpenPlans.
 */
export function useOpenOffer(placement: UpgradePlacement): (offer: { intent: "trial" } | { intent: "pack"; packSlug: string }) => void {
  const ctx = useContext(Ctx);
  return useCallback((offer) => {
    const opts: OpenBillingOptions = { view: "plans", placement, ...offer };
    if (ctx) ctx.openBilling(opts);
    else {
      const q = new URLSearchParams({ billing: "1", view: "plans", intent: offer.intent, src: placement });
      if (offer.intent === "pack") q.set("pack", offer.packSlug);
      // A full navigation on purpose, as useOpenPlans: no app router here.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/dashboard?${q.toString()}`);
    }
  }, [ctx, placement]);
}

export function BillingOverlayProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BillingOverlayState>({ open: false });

  const openBilling = useCallback((opts?: OpenBillingOptions) => {
    setState({ open: true, tab: opts?.tab ?? "overview", view: opts?.view ?? "billing", ...opts });
  }, []);
  const closeBilling = useCallback(() => setState({ open: false }), []);

  // Open from the URL on first mount. This is how every link that can't call
  // into React arrives: the /billing redirect, the four email CTAs, the
  // auto-top-up link, existing Notification rows, and AuthModal's post-signup
  // hard navigation.
  //
  // Read off window.location rather than useSearchParams — the latter forces a
  // Suspense boundary during prerender, and this provider wraps the whole
  // dashboard shell.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") !== "1") return;
    const tab = params.get("tab");
    const view = params.get("view");
    setState({
      open: true,
      tab: (["overview", "usage", "topup", "history"] as const).find(t => t === tab) ?? "overview",
      view: (["billing", "manage", "plans"] as const).find(v => v === view) ?? "billing",
      autotopupSlug: params.get("autotopup"),
      success: params.get("success") === "1" || params.get("success") === "trial",
      trialStarted: params.get("success") === "trial",
      intent: (["trial", "pack"] as const).find(i => i === params.get("intent")),
      packSlug: params.get("pack") ?? undefined,
      placement: placementFromSource(params.get("src")),
    });
  }, []);

  const api = useMemo(
    () => ({ openBilling, closeBilling, isBillingOpen: state.open }),
    [openBilling, closeBilling, state.open],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <BillingOverlay state={state} onClose={closeBilling} />
    </Ctx.Provider>
  );
}
