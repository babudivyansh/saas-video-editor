"use client";

// The top-right cluster every dashboard page shares from xl up: notifications,
// the minutes/credits pill and Add credits. Home renders it in its own top
// bar (with the quest pill in front); every other page gets it from AppTopBar.

import { useTranslations } from "next-intl";
import { NotificationBell } from "@/app/components/NotificationBell";
import { CreditsPill } from "@/app/components/ui/CreditsPill";
import { useBillingOverlay } from "@/app/components/billing/BillingOverlayContext";
import { usePlanSummary } from "@/app/components/usePlanSummary";

export function TopBarStatus({ before }: { before?: React.ReactNode }) {
  const t = useTranslations("Dashboard");
  const { openBilling } = useBillingOverlay();
  const { user, hasActivePlan, minutes, credits, minutesLow } = usePlanSummary();
  if (!user) return null;
  return (
    <div className="flex items-center justify-end gap-2">
      {before}
      <NotificationBell />
      <CreditsPill credits={credits} minutes={minutes} minutesLow={minutesLow} />
      <button
        type="button"
        onClick={() => openBilling({ tab: hasActivePlan ? "topup" : "overview" })}
        className="h-10 whitespace-nowrap rounded-[10px] border border-line bg-surface-3 px-4 text-sm font-semibold text-fg hover:bg-surface-2 hover:border-fg/20 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
      >
        {t("home.addCredits")}
      </button>
    </div>
  );
}
