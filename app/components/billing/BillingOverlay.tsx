"use client";

// One overlay, three swappable views: billing → manage → plans.
//
// Deliberately not three stacked dialogs. Billing is itself an overlay now, so
// stacking would put Change plan three layers deep — each dimming the one
// behind it, and on a phone effectively impossible to back out of. Swapping in
// place keeps a single dialog on screen with a back arrow, which is how Stripe
// and Linear handle the same flow.

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Modal } from "@/app/components/ui/Modal";
import { useAuth } from "@/app/components/AuthContext";
import { BillingPanel } from "./BillingPanel";
import { ManageSubscriptionPanel } from "./ManageSubscriptionPanel";
import { PlansModal } from "./PlansModal";
import type { BillingOverlayState, BillingTab, BillingView } from "./BillingOverlayContext";

interface Purchase {
  id: string;
  amountInPaise: number;
  credits: number;
  status: string;
  createdAt: string;
  plan: { name: string; slug: string } | null;
}

const TITLES: Record<BillingView, string> = {
  billing: "Billing",
  manage: "Manage subscription",
  plans: "Plans & top-ups",
};

export function BillingOverlay({ state, onClose }: { state: BillingOverlayState; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token, refreshUser } = useAuth();

  // Derived during render, not seeded into state at mount. This component is
  // always mounted (the provider renders it as a sibling of the whole app), so
  // a `useState(state.tab)` captured "overview" long before the overlay was
  // ever opened — and an effect that corrected it afterwards ran too late,
  // because BillingPanel had already mounted with the stale initial tab and its
  // own useState ignores later prop changes. The override is what the user's
  // own clicks set; opening again clears it.
  const [viewOverride, setViewOverride] = useState<BillingView | null>(null);
  const [tabOverride, setTabOverride] = useState<BillingTab | null>(null);
  const [successOverride, setSuccessOverride] = useState(false);
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  const view = viewOverride ?? state.view ?? "billing";
  const tab = tabOverride ?? state.tab ?? "overview";
  const success = successOverride || !!state.success;

  const setView = setViewOverride;
  const setTab = setTabOverride;

  // Clear the overrides each time the overlay opens, so a second open with
  // different options (the credits pill asks for the usage tab) isn't ignored
  // in favour of wherever the user left off last time.
  useEffect(() => {
    if (!state.open) return;
    setViewOverride(null);
    setTabOverride(null);
    setSuccessOverride(false);
  }, [state.open]);

  // Manage needs the purchase list for its billing-history section. BillingPanel
  // fetches its own copy for the History tab; this is a small, separate read so
  // Manage can be opened directly from an email deep link without waiting for
  // the billing view to mount first.
  useEffect(() => {
    if (!state.open || !token || view !== "manage" || purchases.length > 0) return;
    fetch("/api/auth/purchases", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : { purchases: [] }))
      .then(d => setPurchases(d.purchases ?? []))
      .catch(() => { /* history is non-critical */ });
  }, [state.open, token, view, purchases.length]);

  // Mirror overlay state into the URL so it stays deep-linkable and a refresh
  // reopens where you were. `replace` + scroll:false: opening billing must not
  // push a history entry, or Back walks the tabs instead of leaving.
  //
  // Skipped on the very first run. React flushes child effects before parent
  // ones, and this component is a child of the provider — so on a
  // /dashboard?billing=1 load this fired while `state.open` was still false and
  // stripped `billing=1` out of the URL before the provider's own mount effect
  // could read it, intermittently killing the deep link.
  const mirrored = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!mirrored.current) {
      mirrored.current = true;
      if (!state.open) return;
    }
    const params = new URLSearchParams(window.location.search);
    if (state.open) {
      params.set("billing", "1");
      if (tab !== "overview") params.set("tab", tab); else params.delete("tab");
      if (view !== "billing") params.set("view", view); else params.delete("view");
    } else {
      // Also clear the params the redirect and the emails add, so closing the
      // overlay leaves a clean URL behind.
      ["billing", "tab", "view", "success", "autotopup"].forEach(k => params.delete(k));
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [state.open, tab, view, pathname, router]);

  function handlePurchaseSuccess() {
    refreshUser();
    setSuccessOverride(true);
    setView("billing");
  }

  return (
    <Modal
      open={state.open}
      onClose={onClose}
      title={TITLES[view]}
      variant="center"
      maxWidth="max-w-4xl"
      onBack={view === "billing" ? undefined : () => setView("billing")}
    >
      {view === "billing" && (
        <BillingPanel
          initialTab={tab}
          success={success}
          autotopupSlug={state.autotopupSlug ?? null}
          onTabChange={setTab}
          onOpenManage={() => setView("manage")}
          onOpenPlans={() => setView("plans")}
          onPurchaseSuccess={handlePurchaseSuccess}
        />
      )}

      {view === "manage" && (
        <ManageSubscriptionPanel
          user={user}
          token={token}
          purchases={purchases}
          onChangePlan={() => setView("plans")}
          onCancelClick={() => setView("billing")}
          onResumed={() => { refreshUser(); setView("billing"); }}
        />
      )}

      {view === "plans" && <PlansModal onPurchaseSuccess={handlePurchaseSuccess} />}
    </Modal>
  );
}
