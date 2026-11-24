"use client";
// Layout templates for AutoClip: which framing a clip gets, drawn so the choice
// reads without explanation. Each kind of video (podcast, gaming, vlog, talking
// head) offers its own two or three; "custom" shows every layout. Used by the
// create flow and the clip panel.

import {
  ALL_LAYOUT_TEMPLATES, LAYOUT_TEMPLATES, layoutTemplateFor,
  type LayoutTemplate, type SpeakerMode, type VideoKind,
} from "@/lib/speaker-modes";

/** A head in a layout drawing. */
function Head({ on, className = "" }: { on: boolean; className?: string }) {
  return <span className={`absolute h-1.5 w-1.5 rounded-full ${on ? "bg-emerald-bright" : "bg-fg-subtle"} ${className}`} />;
}

/** A small 9:16 drawing of a layout. */
export function LayoutGlyph({ mode, on }: { mode: SpeakerMode; on: boolean }) {
  const fill = on ? "bg-emerald-bright/40" : "bg-surface-3";
  const game = on ? "bg-emerald-bright/20" : "bg-surface-2";
  return (
    <span aria-hidden className="relative flex aspect-[9/16] w-9 shrink-0 flex-col gap-0.5 overflow-hidden rounded-md border border-line bg-panel p-0.5">
      {mode === "auto" && (
        <span className={`flex flex-1 items-center justify-center rounded-sm text-[9px] font-bold ${fill} ${on ? "text-emerald-bright" : "text-fg-muted"}`}>AI</span>
      )}
      {mode === "single" && <span className={`relative flex-1 rounded-sm ${fill}`}><Head on={on} className="left-1/2 top-1/3 -translate-x-1/2" /></span>}
      {mode === "active" && (
        <span className={`relative flex-1 rounded-sm ${fill}`}>
          <Head on={on} className="left-1/2 top-1/3 -translate-x-1/2" />
          <span className="absolute right-1 top-1 h-1 w-1 rounded-full bg-warning" />
        </span>
      )}
      {mode === "split" && (
        <>
          <span className={`relative flex-1 rounded-sm ${fill}`}><Head on={on} className="left-1/2 top-1/3 -translate-x-1/2" /></span>
          <span className={`relative flex-1 rounded-sm ${fill}`}><Head on={on} className="left-1/2 top-1/3 -translate-x-1/2" /></span>
        </>
      )}
      {mode === "gaming" && (
        <>
          <span className={`relative flex-[1] rounded-sm ${fill}`}><Head on={on} className="left-1/2 top-1/3 -translate-x-1/2" /></span>
          <span className={`flex-[2] rounded-sm ${game}`} />
        </>
      )}
      {mode === "gaming_pip" && (
        <span className={`relative flex-1 rounded-sm ${game}`}>
          <span className={`absolute left-0.5 top-1.5 h-3 w-3.5 rounded-[2px] border border-fg/40 ${fill}`} />
        </span>
      )}
      {mode === "fit" && (
        <span className={`relative flex flex-1 items-center rounded-sm ${on ? "bg-emerald-bright/10" : "bg-surface-2"}`}>
          <span className={`relative h-[30%] w-full rounded-[2px] ${fill}`}><Head on={on} className="left-1/4 top-1/3" /><Head on={on} className="right-1/4 top-1/3" /></span>
        </span>
      )}
    </span>
  );
}

export function LayoutTemplatePicker({
  kind,
  value,
  onChange,
  labelId,
}: {
  /** null = every layout (the "something else" preset). */
  kind: VideoKind | null;
  value: SpeakerMode;
  onChange: (mode: SpeakerMode) => void;
  labelId?: string;
}) {
  const base: LayoutTemplate[] = kind ? LAYOUT_TEMPLATES[kind] : ALL_LAYOUT_TEMPLATES;
  // A mode chosen elsewhere (Advanced, a retry) that isn't one of this kind's
  // templates still shows, so the selection is never invisible.
  const options = base.some((t) => t.mode === value) ? base : [...base, layoutTemplateFor(value)];
  return (
    <div role="radiogroup" aria-labelledby={labelId} aria-label={labelId ? undefined : "Layout"} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {options.map((t) => {
        const on = t.mode === value;
        return (
          <button
            key={t.mode}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => { if (!on) onChange(t.mode); }}
            className={`flex items-center gap-3 rounded-xl border p-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/70 ${on ? "border-tint-emerald-border bg-tint-emerald" : "border-line bg-bg hover:border-line-strong"}`}
          >
            <LayoutGlyph mode={t.mode} on={on} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className={`text-[13px] font-semibold ${on ? "text-emerald-bright" : "text-fg"}`}>{t.label}</span>
              <span className="text-[11px] leading-snug text-fg-muted">{t.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
