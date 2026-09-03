"use client";

// Onboarding quest card, extracted from app/dashboard/page.tsx.
//
// Two behaviours the inline version did not have:
//   • It collapses. The expanded card is ~550px on desktop and ~900px on
//     mobile — larger than the entire "Start creating" section — so it used to
//     push AutoClip, the product's headline feature, a screen and a half below
//     the fold. It now defaults to a single header bar and remembers the
//     user's toggle.
//   • It has a terminal state. Previously a user who finished all 11 quests
//     kept the full card, 11 struck-through rows and all, forever; the only
//     acknowledgement was a banner appended underneath it.

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card } from "@/app/components/ui/Card";
import { Tooltip } from "@/app/components/ui/Tooltip";
import { levelColor, xpToLevel, TOTAL_XP, RANK_REWARDS } from "@/lib/quest-config";

// Per-device UI preference, so it deliberately does not use the server-side
// User.dismissedHints machinery FeatureHint uses — that is a one-way dismissal
// and this toggle has to work in both directions.
const EXPANDED_STORAGE_KEY = "clipiro:questsExpanded";

export interface QuestItem {
  id: string;
  title: string;
  xp: number;
  trigger: string;
  completedAt: string | null;
}

export interface RankReward {
  level: string;
  reward: number;
}

export interface QuestData {
  quests: QuestItem[];
  earnedXp: number;
  totalXp: number;
  remaining: number;
  level: string;
  allComplete: boolean;
  /** Ranks whose credit grant the user has not been shown yet. */
  newRankRewards?: RankReward[];
}

// ── Quest icons ────────────────────────────────────────────────────────────────
function IcChevron() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 18l6-6-6-6"/></svg>;
}
function IcChevronDown() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M6 9l6 6 6-6"/></svg>;
}
function IcDiscord() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>;
}
function IcFilm() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M17 7h5M2 17h5M17 17h5"/></svg>;
}
function IcMic() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>;
}
function IcImage() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>;
}
function IcVideo() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>;
}
function IcUser() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
}
function IcEraser() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M20 20H7L3 16l10-10 7 7-3.5 3.5"/><path d="M6.5 17.5l4-4"/></svg>;
}
function IcDownload() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
}
function IcCrown() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M2 20h20M4 17l-2-9 6 4 4-7 4 7 6-4-2 9H4z"/></svg>;
}
function IcChart() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M3 3v18h18"/><path d="M7 15l3-4 3 3 4-6"/></svg>;
}
function IcGift() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>;
}

// Quest ids/color/href are structural, joined by `id` (not title text) against
// lib/quest-config.ts's QUEST_DEFINITIONS and the live GET /api/quests data —
// so translating title/desc here never breaks that match. Built as a hook (not
// a module-level const) since useTranslations() needs a component.
//
// XP is intentionally absent: it comes from the API payload, which is the same
// source that computes the progress bar and rank thresholds. It used to be
// duplicated here, so a change to one list silently disagreed with the other.
function useQuests() {
  const t = useTranslations("Dashboard.quests");
  return useMemo(
    () => [
      { id: "join-community", icon: <IcDiscord />, title: t("joinCommunity.title"), desc: t("joinCommunity.desc"), color: "#5865F2", href: null },
      { id: "first-clip", icon: <IcFilm />, title: t("firstClip.title"), desc: t("firstClip.desc"), color: "#335cff", href: "/dashboard/create/auto-clip" },
      { id: "hear-yourself-out", icon: <IcMic />, title: t("hearYourselfOut.title"), desc: t("hearYourselfOut.desc"), color: "#7c3aed", href: "/dashboard/tools/voiceover" },
      { id: "picture-this", icon: <IcImage />, title: t("pictureThis.title"), desc: t("pictureThis.desc"), color: "#d946ef", href: "/dashboard/tools/image-generator" },
      { id: "first-video", icon: <IcVideo />, title: t("firstVideo.title"), desc: t("firstVideo.desc"), color: "#10b981", href: "/dashboard/tools/video-generator" },
      { id: "first-export", icon: <IcDownload />, title: t("firstExport.title"), desc: t("firstExport.desc"), color: "#f59e0b", href: "/dashboard/editor" },
      { id: "upgraded-plan", icon: <IcCrown />, title: t("upgradedPlan.title"), desc: t("upgradedPlan.desc"), color: "#d97706", href: "/dashboard?billing=1" },
      { id: "explore-toolbox", icon: <IcEraser />, title: t("exploreToolbox.title"), desc: t("exploreToolbox.desc"), color: "#06b6d4", href: "/dashboard/tools" },
      { id: "complete-profile", icon: <IcUser />, title: t("completeProfile.title"), desc: t("completeProfile.desc"), color: "#ec4899", href: "/dashboard/settings" },
      { id: "track-account", icon: <IcChart />, title: t("trackAccount.title"), desc: t("trackAccount.desc"), color: "#0ea5e9", href: "/dashboard/social-tracker" },
      { id: "refer-friend", icon: <IcGift />, title: t("referFriend.title"), desc: t("referFriend.desc"), color: "#f43f5e", href: "/dashboard/referral" },
    ],
    [t]
  );
}

interface QuestCardProps {
  questData: QuestData | null;
  /** Signed in — distinguishes "loading" from "nothing to load". */
  hasUser: boolean;
  onDiscordQuest: () => void;
}

export function QuestCard({ questData, hasUser, onDiscordQuest }: QuestCardProps) {
  const t = useTranslations("Dashboard");
  const quests = useQuests();

  // Starts collapsed so the server-rendered HTML and the first client render
  // agree (localStorage is not readable during SSR); the stored preference is
  // applied just after mount. Reading it during render is the specific thing
  // that would produce a hydration mismatch here.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(EXPANDED_STORAGE_KEY) === "true") setExpanded(true);
    } catch { /* private mode / storage disabled — stay collapsed */ }
  }, []);

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    try {
      localStorage.setItem(EXPANDED_STORAGE_KEY, String(next));
    } catch { /* preference just won't persist */ }
  }

  const loading = questData === null && hasUser;
  const earnedXp = questData?.earnedXp ?? 0;
  const remaining = questData?.remaining ?? quests.length;
  // Falls back to the zero-XP rank while the fetch is in flight so a signed-in
  // user sees "Beginner" rather than the pill popping in late.
  const level = questData?.level ?? (hasUser ? xpToLevel(0) : null);
  const allComplete = !!questData?.allComplete;
  const progressPct = Math.round((earnedXp / TOTAL_XP) * 100);

  return (
    <Card className="bg-panel">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        aria-label={t("toggleQuests")}
        className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-gray-50/60 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-[10px] font-bold text-ink-soft uppercase tracking-widest">{t("onboarding")}</p>
            {level && (
              <Tooltip content={t("levelTooltip")} position="bottom">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: levelColor(level) + "18", color: levelColor(level) }}>
                  {level}
                </span>
              </Tooltip>
            )}
          </div>
          {loading ? (
            <div className="h-5 w-40 bg-surface-3 rounded animate-pulse mt-0.5" />
          ) : (
            <p className="text-ink font-bold text-[15px] flex items-center gap-1.5">
              {allComplete && <span aria-hidden="true">🏆</span>}
              {allComplete ? t("allQuestsComplete") : t("questsToGo", { count: remaining })}
            </p>
          )}
          <div className="mt-2 h-1 bg-surface-3 rounded-full w-full max-w-64 overflow-hidden">
            <div className="h-full grad-brand rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }} />
          </div>
          {/* Rank ladder: earned ranks light up in their color, locked
              ranks stay greyed. Each badge tooltips its credit reward. */}
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {RANK_REWARDS.map(rank => {
              const earned = earnedXp >= rank.minXp;
              return (
                <Tooltip
                  key={rank.level}
                  content={t("rankReward", { level: rank.level, credits: rank.reward })}
                  position="bottom"
                >
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border transition-colors"
                    style={
                      earned
                        ? { background: rank.color + "18", color: rank.color, borderColor: rank.color + "33" }
                        : { background: "#f3f4f6", color: "#9ca3af", borderColor: "#e5e7eb" }
                    }
                  >
                    {earned ? rank.level : `🔒 ${rank.level}`}
                  </span>
                </Tooltip>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            {loading ? (
              <div className="h-7 w-24 bg-surface-3 rounded animate-pulse ml-auto" />
            ) : (
              <>
                <span className="text-xl font-extrabold grad-text inline-block">{earnedXp}</span>
                <span className="text-sm text-ink-soft font-normal"> {t("xpTotal", { total: TOTAL_XP })}</span>
              </>
            )}
          </div>
          <span className={`text-fg-subtle transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>
            <IcChevronDown />
          </span>
        </div>
      </button>

      {/* `inert` while collapsed: the rows are still in the DOM for the
          transition, and without it the 11 hidden quest links stay tabbable
          and readable by screen readers. */}
      <div
        inert={!expanded}
        data-testid="quest-body"
        className={`grid transition-all duration-200 ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 border-t border-line">
            {quests.map((q, i) => {
              const liveQuest = questData?.quests?.find(lq => lq.id === q.id);
              const done = !!liveQuest?.completedAt;
              const isDiscord = q.id === "join-community";
              const cls = `flex items-start gap-3 px-4 py-3.5 text-left transition-colors group
                ${i % 2 === 0 ? "sm:border-r border-line" : ""}
                ${i >= 1 ? "border-t border-line" : ""} ${i === 1 ? "sm:border-t-0" : ""}
                ${done ? "bg-tint-emerald cursor-default" : "hover:bg-tint-blue"}`;
              const inner = (
                <>
                  <span className="mt-0.5 flex-shrink-0 opacity-60" style={{ color: q.color }}>{q.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className={`text-sm font-semibold ${done ? "line-through text-fg-subtle" : "text-ink"}`}>{q.title}</span>
                      {liveQuest && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${done ? "bg-tint-emerald text-success border-green-100" : "bg-tint-violet text-accent-violet border-violet-100"}`}>
                          {t("xpSuffix", { xp: liveQuest.xp })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-soft leading-relaxed">{q.desc}</p>
                  </div>
                  {done ? (
                    <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  ) : (
                    <span className="text-fg-subtle group-hover:text-brand transition-colors mt-0.5 flex-shrink-0"><IcChevron /></span>
                  )}
                </>
              );
              // Auto-trigger quests (everything but Discord) complete by
              // actually using the relevant tool — clicking navigates there.
              if (!done && q.href) {
                return <Link key={q.id} href={q.href} className={cls}>{inner}</Link>;
              }
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={isDiscord && !done ? onDiscordQuest : undefined}
                  disabled={done}
                  className={cls}
                >
                  {inner}
                </button>
              );
            })}
          </div>

          {allComplete && (
            <div className="border-t border-green-100 bg-tint-emerald px-5 py-3 flex items-center gap-2.5">
              <span className="text-success text-lg" aria-hidden="true">🎉</span>
              <p className="text-sm font-semibold text-green-700">{t("allQuestsCompleteBanner")}</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
