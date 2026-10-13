"use client";

// Onboarding quests once a user is past the first few (Home, from xl up): a
// pill in the top-right cluster — progress ring, quests left, rank — that
// opens the full quest list in a popover. Brand-new users get the inline
// strip instead (see app/dashboard/page.tsx).

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { QuestCard, type QuestData } from "@/app/components/dashboard/QuestCard";
import { levelColor, TOTAL_XP } from "@/lib/quest-config";

export function QuestPill({ questData, onDiscordQuest }: { questData: QuestData; onDiscordQuest: () => void }) {
  const t = useTranslations("Dashboard");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape — scoped to while it is open.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pct = Math.min(1, (questData.earnedXp ?? 0) / TOTAL_XP);
  const r = 14;
  const c = 2 * Math.PI * r;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex h-10 items-center gap-2.5 rounded-[10px] border bg-surface-2 pl-2 pr-3 text-[13px] font-semibold text-fg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
          open ? "border-primary/40" : "border-line hover:border-primary/40"
        }`}
      >
        <svg viewBox="0 0 36 36" className="h-[26px] w-[26px] -rotate-90" aria-hidden="true">
          <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" className="stroke-surface-3" />
          <circle
            cx="18" cy="18" r={r} fill="none" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - pct)} className="stroke-success"
          />
        </svg>
        {t("home.questsLeft", { count: questData.remaining })}
        {questData.level && (
          <span
            className="rounded-md px-1.5 py-px text-[11px] font-bold"
            style={{ background: levelColor(questData.level) + "18", color: levelColor(questData.level) }}
          >
            {questData.level}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("onboarding")}
          className="absolute right-0 top-full z-50 mt-2 max-h-[min(640px,calc(100dvh-120px))] w-[400px] overflow-y-auto rounded-2xl border border-line bg-panel shadow-xl"
        >
          <QuestCard questData={questData} hasUser onDiscordQuest={onDiscordQuest} variant="popover" />
        </div>
      )}
    </div>
  );
}
