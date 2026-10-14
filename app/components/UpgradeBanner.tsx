"use client";

// The centered "upgrade" pill shown to free users (Home, the affiliate
// dashboard). Opens the full-screen "Upgrade your plan" page directly.
// Renders nothing for signed-out users and for anyone with an active plan.

import { useTranslations } from "next-intl";
import { useBillingOverlay } from "@/app/components/billing/BillingOverlayContext";
import { usePlanSummary } from "@/app/components/usePlanSummary";

const IcCrown = () => <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 flex-shrink-0" aria-hidden="true"><path d="M3 18h18l-2-10-5 4-2-7-2 7-5-4z" /></svg>;

export function UpgradeBanner({ className = "" }: { className?: string }) {
  const t = useTranslations("Dashboard");
  const { openBilling } = useBillingOverlay();
  const { user, hasActivePlan } = usePlanSummary();
  if (!user || hasActivePlan) return null;

  return (
    <div className={`flex justify-center ${className}`}>
      <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-2 rounded-xl border border-line bg-surface-2 py-1.5 pl-4 pr-1.5 text-sm font-medium text-fg">
        <span className="text-warning"><IcCrown /></span>
        <span>{t("home.upgradeBanner")}</span>
        <button
          type="button"
          onClick={() => openBilling({ view: "plans" })}
          className="h-8 rounded-lg border border-line bg-surface-3 px-3.5 text-sm font-semibold text-fg hover:border-fg/20 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
        >
          {t("home.upgrade")}
        </button>
      </div>
    </div>
  );
}
