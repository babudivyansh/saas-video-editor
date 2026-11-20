"use client";

// Home's top bar (from xl up; the shell header is hidden there on every page):
// the shared status cluster with the quest pill in front, sticky so it stays
// in place while Home scrolls, and for free users a centered upgrade banner
// under it. Other pages get the same cluster plus a
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
    <>
      {/* Pinned to the top of the scrolling <main> so it stays put like
          AppTopBar does on every other page (that one sits outside <main>;
          this one can't, since the quest data lives in the Home page).
          A sticky box only sticks within its parent, so this must be a
          direct child of the page's full-height content column — hence the
          fragment, not a wrapper div. Same h-16 strip as AppTopBar, and
          -mt-4/-mx-12 cancel the page's pt-4 and xl:px-12 so it starts flush
          and doesn't jump when it sticks. The solid bg-surface hides content
          scrolling underneath. Only the status cluster pins; the upgrade
          banner scrolls away with the page. */}
      <div className="sticky top-0 z-30 -mx-12 -mt-4 hidden h-16 items-center justify-end bg-surface px-12 xl:flex">
        <TopBarStatus before={quests && <QuestPill questData={quests.data} onDiscordQuest={quests.onDiscordQuest} />} />
      </div>

      <div className="hidden xl:block">
        <UpgradeBanner />
      </div>
    </>
  );
}
