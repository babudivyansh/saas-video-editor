"use client";

import CaptionStyleGrid from "@/app/components/auto-clip/CaptionStyleGrid";

// The caption-style step for the non-AutoClip create flows.
//
// It replaces four verbatim copies of the same thing: a 16-entry CSS table
// (`ONE_WORD_STYLES`/`LINE_STYLES`) plus a tile grid, duplicated across
// reddit-video, split-video, viral-split-screen and streamer-video and selected
// by array index. Four copies meant four chances to drift, and they had:
// reddit's table grew to 20 tiles while the renderer defines 16, so tiles 16-19
// all rendered as tile 15; and the `lines` table never matched the renderer's
// at all, so every "lines" preview on three pages showed the wrong look.
//
// Now these pages pick from the same named library AutoClip uses, by slug, and
// the swatch is drawn from the template's own style — so the preview and the
// burn-in cannot disagree.

export interface SubtitleTemplateStepProps {
  /** Template slug. */
  value: string;
  onChange: (templateId: string) => void;
  mode: "oneword" | "lines";
  onModeChange: (m: "oneword" | "lines") => void;
  title?: string;
  /** The word drawn in each swatch. */
  sample?: string;
  /**
   * Outer spacing. Defaults to the step padding the pages that render this as
   * a WHOLE step expect; pass "" where it sits inside an already-padded
   * container, or the padding doubles.
   */
  className?: string;
}

export default function SubtitleTemplateStep({
  value,
  onChange,
  mode,
  onModeChange,
  title = "Select Subtitle Template",
  sample = "Clipiro",
  className = "px-8 pt-6 pb-10",
}: SubtitleTemplateStepProps) {
  return (
    <div className={className}>
      <h2 className="text-lg font-bold text-fg">{title}</h2>

      <div className="flex items-center gap-3 mt-3 mb-5">
        <span className={`text-sm font-medium ${mode === "oneword" ? "text-ink" : "text-ink-soft"}`}>
          One Word
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={mode === "lines"}
          aria-label="Caption layout"
          // NOT resetting the selection on toggle. The old handler called
          // onSelect(0) here because the two modes indexed two different
          // tables, so an index meant different things either side of the
          // switch. A slug means the same thing in both, and silently
          // discarding the user's pick when they flip a layout toggle was
          // never a feature.
          onClick={() => onModeChange(mode === "oneword" ? "lines" : "oneword")}
          className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
            mode === "lines" ? "bg-brand" : "bg-surface-3"
          }`}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full bg-panel transition-all shadow-sm"
            style={{ left: mode === "lines" ? "22px" : "2px" }}
          />
        </button>
        <span className={`text-sm font-medium ${mode === "lines" ? "text-ink" : "text-ink-soft"}`}>
          Lines
        </span>
      </div>

      <p className="mb-4 text-xs text-ink-soft">
        {mode === "oneword"
          ? "One word at a time, highlighted as it's spoken."
          : "Grouped into short lines instead of single words."}
      </p>

      <CaptionStyleGrid value={value} onChange={onChange} sample={sample} />
    </div>
  );
}
