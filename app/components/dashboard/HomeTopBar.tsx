"use client";

// Home's top bar (from xl up; the shell header is hidden there on every page):
// the shared status cluster with the quest pill in front, and for free users a
// centered upgrade banner under it. Other pages get the same cluster plus a
// search box from AppTopBar. The account menu heads the sidebar rail.

import { usePlanSummary } from "@/app/components/usePlanSummary";
import { TopBarStatus } from "@/app/components/TopBarStatus";
import { UpgradeBanner } from "@/app/components/UpgradeBanner";
import { QuestPill } from "@/app/components/dashboard/QuestPill";
import type { QuestData } from "@/app/components/dashboard/QuestCard";

export function HomeTopBar({ quests }: {
  /** Set when quests belong in the pill (past the first few, not all done). */
  quests?: { data: QuestData; onDiscordQuest: () => void } | null;
}) {
  const { user } = usePlanSummary();
  if (!user) return null;

  return (
    <div className="hidden xl:block">
      <TopBarStatus before={quests && <QuestPill questData={quests.data} onDiscordQuest={quests.onDiscordQuest} />} />

      <UpgradeBanner className="mt-2" />
    </div>
  );
}
