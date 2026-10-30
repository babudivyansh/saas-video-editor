"use client";

// The caption template picker used everywhere a template is chosen: the
// AutoClip create page, a clip's Captions panel, the editor and brand kits.
//
// Every card is a live preview (CaptionTemplateRender on a demo clock) of the
// template's own sample line, so what the user picks is what gets burned in.
// Templates above the user's plan stay visible with a lock; picking one asks
// the parent to show the upgrade path instead of selecting it.

import { useMemo, useRef, useState } from "react";
import {
  CAPTION_TIER_LABEL,
  parseCaptionSample,
  type CaptionFamilyId,
  type CaptionTemplateSpec,
} from "@clipiro/shared/caption-templates";
import CaptionTemplateRender, { type PreviewWord } from "./CaptionTemplateRender";
import { useCaptionTemplates, type PickerTemplate } from "./useCaptionTemplates";
import { useDemoClock } from "./useDemoClock";

const WORD_MS = 360;

/** A template's sample line as timed preview words (same timing the sample renders use). */
export function sampleWords(t: CaptionTemplateSpec): PreviewWord[] {
  const tokens = parseCaptionSample(t.sample);
  return tokens.map((tok, i) => ({
    text: tok.text,
    start: 200 + i * WORD_MS,
    end: 200 + i * WORD_MS + WORD_MS - 30,
    emoji: tok.emoji,
    emphasis: tok.emphasis,
    speaker: t.extra === "speakers" ? Math.floor(i / 4) % 2 : 0,
  }));
}

export function TemplatePreviewLoop({
  template,
  className,
  showSafeZone,
  accent,
}: {
  template: CaptionTemplateSpec;
  className?: string;
  showSafeZone?: boolean;
  accent?: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const words = useMemo(() => sampleWords(template), [template]);
  const length = (words[words.length - 1]?.end ?? 0) + 900;
  const rest = (words[1]?.start ?? 300) + 240;
  const t = useDemoClock(ref, length, rest);
  return (
    <div ref={ref} className={className}>
      <CaptionTemplateRender template={template} words={words} timeMs={t} showSafeZone={showSafeZone} accent={accent} />
    </div>
  );
}

function LockIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
    </svg>
  );
}

export interface CaptionTemplateGalleryProps {
  value: string | null;
  onChange: (templateId: string) => void;
  /** Called instead of onChange when a locked template is picked. */
  onLocked?: (template: PickerTemplate) => void;
  disabled?: boolean;
  /** Grid columns at the widest size; the grid starts at 3, or stays at 2 in a narrow rail. */
  columns?: 2 | 3 | 4 | 5;
  /** Cap the grid height and scroll inside it. */
  maxHeightClass?: string;
}

export default function CaptionTemplateGallery({
  value,
  onChange,
  onLocked,
  disabled,
  columns = 4,
  maxHeightClass = "max-h-[460px]",
}: CaptionTemplateGalleryProps) {
  const { templates, families } = useCaptionTemplates();
  const [family, setFamily] = useState<CaptionFamilyId | "all">("all");
  const [focus, setFocus] = useState<string | null>(null);

  const tabs = useMemo(() => families.filter((f) => templates.some((t) => t.family === f.id)), [families, templates]);
  const visible = useMemo(() => (family === "all" ? templates : templates.filter((t) => t.family === family)), [templates, family]);
  const described = templates.find((t) => t.id === (focus ?? value)) ?? null;
  const cols = columns === 2 ? "grid-cols-2" : `grid-cols-3 ${columns === 5 ? "sm:grid-cols-5" : columns === 3 ? "" : "sm:grid-cols-4"}`;

  return (
    <div className="space-y-2.5">
      <div
        className={`flex gap-1 ${columns === 2 ? "-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]" : "flex-wrap"}`}
        role="tablist"
        aria-label="Caption template families"
      >
        {[{ id: "all" as const, name: "All" }, ...tabs].map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={family === f.id}
            disabled={disabled}
            onClick={() => setFamily(f.id)}
            className={`flex-shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
              family === f.id
                ? "bg-tint-emerald text-ink border border-tint-emerald-border"
                : "text-ink-soft border border-card-border hover:text-ink"
            }`}
          >
            {f.name}
          </button>
        ))}
      </div>

      <div className={`${maxHeightClass} overflow-y-auto overscroll-contain pr-1`}>
        <div className={`grid ${cols} gap-2.5`}>
          {visible.map((t) => {
            const selected = value === t.id;
            return (
              <button
                key={t.id}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                aria-label={`${t.name}${t.locked ? `, needs ${CAPTION_TIER_LABEL[t.tier]}` : ""}`}
                title={t.hint}
                onClick={() => (t.locked ? onLocked?.(t) : onChange(t.id))}
                onMouseEnter={() => setFocus(t.id)}
                onMouseLeave={() => setFocus((f) => (f === t.id ? null : f))}
                onFocus={() => setFocus(t.id)}
                onBlur={() => setFocus((f) => (f === t.id ? null : f))}
                className={`group relative text-left rounded-xl overflow-hidden bg-surface-2 transition-all disabled:opacity-40 ${
                  selected ? "ring-2 ring-brand" : "ring-1 ring-card-border hover:ring-brand/50"
                }`}
              >
                <TemplatePreviewLoop template={t} className={t.locked ? "opacity-60" : ""} />
                {/* On the preview, not beside the name, so narrow grids keep the name readable. */}
                {t.tier !== "free" && (
                  <span
                    className={`absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wide ${
                      t.tier === "pro" ? "bg-tint-amber text-ink border border-tint-amber-border" : "bg-tint-emerald text-ink border border-tint-emerald-border"
                    }`}
                  >
                    {t.locked && <LockIcon />}
                    {CAPTION_TIER_LABEL[t.tier]}
                  </span>
                )}
                <span className="block px-2 py-1.5">
                  <span className={`block truncate text-[11px] font-semibold ${selected ? "text-ink" : "text-ink-soft"}`}>{t.name}</span>
                </span>
                {selected && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-brand flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {described && (
        <p className="text-[11.5px] text-ink-soft min-h-[2.4em]">
          <span className="font-semibold text-ink">{described.name}.</span> {described.hint}
          {described.locked && <> Available on {CAPTION_TIER_LABEL[described.tier]} and up.</>}
        </p>
      )}
    </div>
  );
}
