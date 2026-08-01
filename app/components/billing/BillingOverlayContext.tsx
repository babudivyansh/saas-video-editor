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

export type BillingTab = "overview" | "usage" | "topup" | "history";
export type BillingView = "billing" | "manage" | "plans";

export interface OpenBillingOptions {
  tab?: BillingTab;
  view?: BillingView;
  /** Pack slug to emphasise in Top Up, from the auto-top-up email's ?autotopup=. */
  autotopupSlug?: string | null;
  /** Show the post-purchase success banner (?success=1). */
  success?: boolean;
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
      success: params.get("success") === "1",
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
