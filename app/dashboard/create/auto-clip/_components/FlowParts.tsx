"use client";
// Presentational pieces of the AutoClip create flow (design C: one question
// at a time). The page owns every bit of state; these only draw it.

import type { ReactNode } from "react";
import s from "./flow.module.css";
import type { SpeakerMode, VideoKind } from "@/lib/speaker-modes";

export type FlowStep = 1 | 2 | 3;
export const FLOW_STEPS: FlowStep[] = [1, 2, 3];

export function FlowHeader({ step, minutesBalance }: { step: FlowStep; minutesBalance: number | null }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 px-6 pt-6 sm:px-8">
      <span className="text-sm font-bold text-fg">AutoClip</span>
      <div className={s.dots} role="img" aria-label={`Question ${step} of 3`}>
        {FLOW_STEPS.map((n) => <span key={n} className={`${s.dot} ${n <= step ? s.dotOn : ""}`} />)}
      </div>
      <span className="text-[13px] text-fg-muted tabular-nums">
        {minutesBalance != null ? `${minutesBalance} Clip Minute${minutesBalance === 1 ? "" : "s"}` : " "}
      </span>
    </header>
  );
}

/**
 * The question, revealed left→right and wiped back right→left on a loop.
 * `before` + `accent` + `after` read as one sentence; the accent word is
 * underlined. Screen readers get the plain sentence.
 */
export function QuestionHeading({ step, before, accent, after }: { step: FlowStep; before: string; accent: string; after: string }) {
  const sentence = `${before}${accent}${after}`;
  return (
    <div className="flex flex-col items-center gap-3.5 text-center">
      <span className={`${s.eyebrow} font-mono text-xs font-semibold uppercase tracking-[0.14em] text-fg-muted`}>Question {step} of 3</span>
      <h1 aria-label={sentence} className="max-w-[900px] text-[40px] font-bold leading-[1.04] tracking-[-0.04em] text-fg sm:text-[64px]">
        <span aria-hidden="true" className={s.reveal}>
          {before}<span className={s.accent}>{accent}</span>{after}<span className={s.caret} />
        </span>
      </h1>
    </div>
  );
}

export type PresetId = "podcast" | "talking" | "gaming" | "vlog" | "custom";
export interface Preset {
  id: PresetId;
  title: string;
  summary: string;
  /** Settings it applies; omitted keys stay as the user had them. */
  apply?: { clipCount: number; length: "short" | "standard" | "long"; speakerMode: SpeakerMode };
}
export const PRESETS: Preset[] = [
  { id: "podcast", title: "Podcast or interview", summary: "8 clips · 15–60s · follows whoever is talking", apply: { clipCount: 8, length: "standard", speakerMode: "auto" } },
  { id: "talking", title: "Talking head or tutorial", summary: "6 clips · under 30s · one speaker, tight framing", apply: { clipCount: 6, length: "short", speakerMode: "single" } },
  { id: "gaming", title: "Gaming stream", summary: "6 clips · 15–60s · facecam on top, gameplay below", apply: { clipCount: 6, length: "standard", speakerMode: "gaming" } },
  { id: "vlog", title: "Vlog or travel", summary: "6 clips · 15–60s · follows you, wide shots kept whole", apply: { clipCount: 6, length: "standard", speakerMode: "single" } },
  { id: "custom", title: "Something else", summary: "You choose length, shape and captions next" },
];

const PRESET_ICON: Record<PresetId, ReactNode> = {
  podcast: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" /></svg>,
  talking: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>,
  gaming: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 11h4M8 9v4M15 12h.01M18 10h.01" /><path d="M17.3 5H6.7a4 4 0 0 0-3.96 3.44l-.7 4.95A3 3 0 0 0 7.2 15.6L8.5 14h7l1.3 1.6a3 3 0 0 0 5.16-2.2l-.7-4.95A4 4 0 0 0 17.3 5Z" /></svg>,
  vlog: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 10l4.55-2.28A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.9L15 14" /><rect x="3" y="6" width="12" height="12" rx="2" /></svg>,
  custom: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>,
};

export function PresetCards({ value, onChange }: { value: PresetId | null; onChange: (p: Preset) => void }) {
  return (
    <div className="flex w-full max-w-[1040px] flex-col gap-3.5">
      <p id="ac-preset-label" className="text-sm text-fg-muted">What kind of video is it? We’ll set everything up for you.</p>
      <div role="radiogroup" aria-labelledby="ac-preset-label" className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        {PRESETS.map((p, i) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={value === p.id}
            onClick={() => onChange(p)}
            className={`${s.preset} ${s.rise} ${value === p.id ? s.presetOn : ""} flex flex-col gap-3 rounded-[20px] border border-line bg-surface-1 p-[18px] text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/70`}
            style={{ animationDelay: `${0.15 + i * 0.08}s` }}
          >
            <span className={s.fan} aria-hidden="true"><span /><span>{PRESET_ICON[p.id]}</span><span /></span>
            <span className="text-[17px] font-bold text-fg">{p.title}</span>
            <span className="text-[13px] text-fg-muted">{p.summary}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function StepFooter({ hint, onBack, children }: { hint: string; onBack?: () => void; children: ReactNode }) {
  return (
    <footer className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-bg/90 px-6 py-4 backdrop-blur sm:px-8">
      <div className="flex min-w-0 items-center gap-3">
        {onBack && (
          <button type="button" onClick={onBack} className="h-11 rounded-full border border-line-strong px-5 text-sm font-semibold text-fg outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-primary/70">
            ← Back
          </button>
        )}
        <span className="text-[13px] text-fg-muted">{hint}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </footer>
  );
}

export const flowStyles = s;

/** The layout templates a preset offers; "custom" (or no preset) shows them all. */
export function videoKindFor(preset: PresetId | null): VideoKind | null {
  return preset && preset !== "custom" ? preset : null;
}
