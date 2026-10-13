"use client";

// Home has no shell header from xl up (DashboardShell hides it there), so the
// page carries its own: status in the top-right corner, and for free users a
// centered upgrade banner under it. The account menu is not here — from xl up
// it heads the sidebar rail. Below xl the shell header is back and this bar
// is hidden.

import { useTranslations } from "next-intl";
import { NotificationBell } from "@/app/components/NotificationBell";
import { CreditsPill } from "@/app/components/ui/CreditsPill";
import { useBillingOverlay } from "@/app/components/billing/BillingOverlayContext";
import { usePlanSummary } from "@/app/components/usePlanSummary";
import { QuestPill } from "@/app/components/dashboard/QuestPill";
import type { QuestData } from "@/app/components/dashboard/QuestCard";

const IcCrown = () => <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true"><path d="M3 18h18l-2-10-5 4-2-7-2 7-5-4z" /></svg>;

export function HomeTopBar({ quests }: {
  /** Set when quests belong in the pill (past the first few, not all done). */
  quests?: { data: QuestData; onDiscordQuest: () => void } | null;
}) {
  const t = useTranslations("Dashboard");
  const { openBilling } = useBillingOverlay();
  const { user, hasActivePlan, minutes, credits, minutesLow } = usePlanSummary();
  if (!user) return null;

  return (
    <div className="hidden xl:block">
      <div className="flex items-center justify-end gap-2">
        {quests && <QuestPill questData={quests.data} onDiscordQuest={quests.onDiscordQuest} />}
        <NotificationBell />
        <CreditsPill credits={credits} minutes={minutes} minutesLow={minutesLow} />
        <button
          type="button"
          onClick={() => openBilling({ tab: hasActivePlan ? "topup" : "overview" })}
          className="h-10 rounded-[10px] border border-line bg-surface-3 px-4 text-sm font-semibold text-fg hover:bg-surface-2 hover:border-fg/20 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
        >
          {t("home.addCredits")}
        </button>
      </div>

      {!hasActivePlan && (
        <div className="mt-2 flex justify-center">
          <div className="flex items-center gap-3.5 rounded-xl border border-line bg-surface-2 py-1.5 pl-4 pr-1.5 text-sm font-medium text-fg">
            <span className="text-warning"><IcCrown /></span>
            {t("home.upgradeBanner")}
            <button
              type="button"
              onClick={() => openBilling({ tab: "overview" })}
              className="h-8 rounded-lg border border-line bg-surface-3 px-3.5 text-sm font-semibold text-fg hover:border-fg/20 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              {t("home.upgrade")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
