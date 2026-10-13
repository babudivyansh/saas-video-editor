"use client";

// Home has no shell header from xl up (DashboardShell hides it there), so the
// page carries its own slim bar: greeting on the left, status and account on
// the right. Below xl the shell header is back and this bar is hidden.
//
// The account menu keeps the product tour's `account-menu` target on this
// page — the tour's last step points at it, and without a target there the
// tour would sit invisible instead of finishing.

import { useTranslations } from "next-intl";
import { NotificationBell } from "@/app/components/NotificationBell";
import { CreditsPill } from "@/app/components/ui/CreditsPill";
import SidebarAccount from "@/app/components/SidebarAccount";
import { useBillingOverlay } from "@/app/components/billing/BillingOverlayContext";
import { usePlanSummary } from "@/app/components/usePlanSummary";

export function HomeTopBar({ firstName, questsLeft, onQuests }: {
  firstName?: string;
  /** Null until quests load; 0 hides the chip. */
  questsLeft: number | null;
  onQuests: () => void;
}) {
  const t = useTranslations("Dashboard");
  const { openBilling } = useBillingOverlay();
  const { user, hasActivePlan, minutes, credits, minutesLow } = usePlanSummary();
  if (!user) return null;

  return (
    <div className="hidden xl:flex items-center justify-between gap-3">
      <p className="pl-1 text-sm text-fg-muted">
        {firstName ? t.rich("home.welcome", { name: firstName, b: (c) => <span className="font-semibold text-fg">{c}</span> }) : t("aiClipStudio")}
      </p>
      <div className="flex items-center gap-2">
        {questsLeft != null && questsLeft > 0 && (
          <button
            type="button"
            onClick={onQuests}
            className="h-10 rounded-[10px] border border-line bg-surface-2 px-3 text-[13px] font-semibold text-fg hover:border-primary/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            {t("home.questsLeft", { count: questsLeft })}
          </button>
        )}
        <NotificationBell />
        <CreditsPill credits={credits} minutes={minutes} minutesLow={minutesLow} />
        <button
          type="button"
          onClick={() => openBilling({ tab: hasActivePlan ? "topup" : "overview" })}
          className="h-10 rounded-[10px] bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          {hasActivePlan ? t("home.topUp") : t("home.upgrade")}
        </button>
        <div data-tour="account-menu" className="flex items-center">
          <SidebarAccount />
        </div>
      </div>
    </div>
  );
}
