"use client";
import { useId, useState } from "react";

// The clip panel's accordion (design B). Each tab is a stack of these: one
// open at a time, and a closed one still says what it's set to, so the whole
// tab can be read without scrolling or opening anything.

/** One-open-at-a-time state for a tab's sections. `null` = all closed. */
export function useAccordion(initial: string | null) {
  const [openId, setOpenId] = useState<string | null>(initial);
  return (id: string) => ({
    open: openId === id,
    onToggle: () => setOpenId((o) => (o === id ? null : id)),
  });
}

export interface PanelSectionProps {
  title: string;
  /** What it's set to, shown on the right while closed (and open). */
  summary?: React.ReactNode;
  /** From useAccordion. Omit both for a row that never opens (e.g. a switch). */
  open?: boolean;
  onToggle?: () => void;
  /** A control on the header row itself (a Switch, a Copy button). Sits outside the toggle button. */
  trailing?: React.ReactNode;
  children?: React.ReactNode;
}

export function PanelSection({ title, summary, open = false, onToggle, trailing, children }: PanelSectionProps) {
  const bodyId = useId();
  const toggles = !!onToggle && children !== undefined;
  const summaryEl = summary != null && summary !== "" && (
    <span className="min-w-0 truncate text-right font-mono text-[11px] text-fg-muted">{summary}</span>
  );
  return (
    <section className={`rounded-xl border bg-surface-1 transition-colors ${open ? "border-line-strong" : "border-line"}`}>
      <div className="flex items-center gap-2 pr-3">
        {toggles ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={bodyId}
            className="flex min-h-[46px] min-w-0 flex-1 items-center gap-2.5 rounded-xl py-2 pl-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-bright"
          >
            <span className="shrink-0 text-[13px] font-semibold text-fg">{title}</span>
            <span className="flex min-w-0 flex-1 justify-end">{summaryEl}</span>
            <svg
              aria-hidden
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className={`shrink-0 text-fg-muted transition-transform ${open ? "rotate-180" : ""}`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        ) : (
          <div className="flex min-h-[46px] min-w-0 flex-1 items-center gap-2.5 py-2 pl-3.5">
            <span className="shrink-0 text-[13px] font-semibold text-fg">{title}</span>
            <span className="flex min-w-0 flex-1 justify-end">{summaryEl}</span>
          </div>
        )}
        {trailing && <div className="shrink-0">{trailing}</div>}
      </div>
      {toggles && open && (
        <div id={bodyId} className="ac-panel-in space-y-3 px-3.5 pb-3.5">
          {children}
        </div>
      )}
    </section>
  );
}

/** Segmented choice (speed, zoom, aspect…). The selected option is a raised chip, not lime: lime is for the panel's one primary action. */
export function Segmented<T extends string | number>({
  label, options, value, onChange, disabled,
}: {
  label: string;
  options: readonly { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-0.5 rounded-[10px] border border-line bg-bg p-[3px]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => { if (!on) onChange(o.value); }}
            className={`flex min-h-[32px] flex-1 items-center justify-center gap-1.5 rounded-[7px] px-1 text-[12px] font-semibold transition-colors disabled:cursor-default ${
              on ? "bg-surface-3 text-fg ring-1 ring-inset ring-line-strong" : "text-fg-muted hover:text-fg"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A labelled range with its value on the right. */
export function PanelSlider({
  label, value, display, min, max, step, onChange, disabled,
}: {
  label: string; value: number; display: string; min: number; max: number; step: number;
  onChange: (v: number) => void; disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[12px]">
        <label htmlFor={id} className="text-fg-muted">{label}</label>
        <span className="font-mono text-[11px] text-fg">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-surface-3 accent-emerald-bright"
      />
    </div>
  );
}
