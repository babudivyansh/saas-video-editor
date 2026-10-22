"use client";

// The AI tool pages' shared layout ("B · Workspace" from the 2026-10 redesign
// canvas): controls, price and the run button in a left panel; a large result
// stage on the right with what this tool made recently underneath. Full
// screen, no drawers. The panel stacks above the stage on narrow screens.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { ToolIcon } from "@/app/components/toolIcons";
import type { ToolIcon as ToolIconName } from "@/app/components/featureLinks";

export type ToolBadgeTone = "neutral" | "pro" | "free";

export function ToolBadge({ tone = "neutral", children }: { tone?: ToolBadgeTone; children: React.ReactNode }) {
  const cls =
    tone === "pro" ? "border-warning/30 bg-warning/10 text-warning" :
    tone === "free" ? "border-success/30 bg-success/10 text-success" :
    "border-line-strong bg-surface-1 text-fg-muted";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

/** "Costs N credits" on the left, the balance on the right. */
export function CostRow({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-1 px-3.5 py-2.5 text-[13px] text-fg-muted">
      <span>{children}</span>
      {right != null && <span className="text-fg-subtle">{right}</span>}
    </div>
  );
}

/** A labelled group of controls in the left panel. */
export function ToolField({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{label}</p>
        {hint != null && <span className="text-[11.5px] text-fg-subtle">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** The stage before there is anything to show. */
export function StageEmpty({ icon, title, children }: { icon: ToolIconName; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface-1 p-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-3 text-fg-muted"><ToolIcon name={icon} className="h-6 w-6" /></span>
      <p className="text-[15px] font-semibold text-fg">{title}</p>
      {children != null && <div className="max-w-sm text-[13px] text-fg-muted">{children}</div>}
    </div>
  );
}

/** Progress for a running job, shown on the stage. */
export function StageProgress({ label, progress, onCancel, cancelLabel = "Cancel and refund" }: { label: string; progress: number; onCancel?: () => void; cancelLabel?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-line bg-surface-1 p-8">
      <p className="text-[15px] font-semibold text-fg">{label}</p>
      <div className="w-full max-w-md">
        <div className="mb-1.5 flex justify-between text-[12px] text-fg-subtle"><span>Working on it</span><span>{pct}%</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {onCancel && (
        <button type="button" onClick={onCancel} className="text-xs font-medium text-fg-subtle transition-colors hover:text-error">{cancelLabel}</button>
      )}
    </div>
  );
}

function fmtBytes(n: number) {
  return n >= 1024 * 1024 * 1024 ? `${(n / 1024 / 1024 / 1024).toFixed(1)} GB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The left panel's file input: a drop target until a file is chosen, then a
 * compact row with the file's name and a remove button. Validation stays with
 * the caller (`onFile` decides whether to accept).
 */
export function FileDrop({
  accept, title = "Click or drag a file here", hint, file, detail, onFile, onClear, disabled, inputLabel = "Upload a file",
}: {
  accept: string;
  title?: string;
  hint?: React.ReactNode;
  file: File | null;
  /** Extra detail for the chosen file ("1:40 · 1080×1920"). */
  detail?: React.ReactNode;
  onFile: (f: File) => void;
  onClear?: () => void;
  disabled?: boolean;
  inputLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  if (file) {
    return (
      // launch-sweep (globals.css): the Home launch box's running edge light,
      // shown while a file is chosen.
      <div className="launch-sweep relative flex items-center gap-3 rounded-xl border border-line bg-surface-1 p-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-3 text-fg-muted">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" /><path d="M14 3v6h6" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium text-fg">{file.name}</p>
          <p className="text-[12px] text-fg-subtle">{fmtBytes(file.size)}{detail != null ? <> · {detail}</> : null}</p>
        </div>
        {onClear && !disabled && (
          <button type="button" onClick={onClear} aria-label={`Remove ${file.name}`} className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <input ref={inputRef} type="file" accept={accept} className="hidden" disabled={disabled} aria-label={inputLabel}
             onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
        className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-8 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50 ${
          dragging ? "border-primary bg-primary/10" : "border-line-strong bg-surface-1 hover:bg-surface-3"
        }`}
      >
        <span className="text-primary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
        </span>
        <span className="text-[13px] font-medium text-fg">{title}</span>
        {hint != null && <span className="text-[11.5px] text-fg-subtle">{hint}</span>}
      </button>
    </>
  );
}

/** Two or more mutually exclusive option cards (radio group). */
export function OptionCards<T extends string>({ name, value, options, onChange, disabled, columns = 2 }: {
  name: string;
  value: T;
  options: readonly (readonly [T, string, string?])[];
  onChange: (v: T) => void;
  disabled?: boolean;
  columns?: 1 | 2 | 3;
}) {
  const cols = columns === 1 ? "grid-cols-1" : columns === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <div role="radiogroup" className={`grid gap-2 ${cols}`}>
      {options.map(([v, title, sub]) => (
        <label key={v} className={`cursor-pointer rounded-xl border px-3 py-2.5 transition-colors ${value === v ? "border-primary/60 bg-primary/10" : "border-line bg-surface-1 hover:bg-surface-3"} ${disabled ? "pointer-events-none opacity-60" : ""}`}>
          <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} disabled={disabled} className="sr-only" />
          <span className="block text-[13px] font-semibold text-fg">{title}</span>
          {sub && <span className="mt-0.5 block text-[11.5px] text-fg-subtle">{sub}</span>}
        </label>
      ))}
    </div>
  );
}

/** Small segmented Before/After style switch. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface-1 p-0.5">
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${value === v ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg"}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

interface RecentAsset { id: string; name: string; url: string; thumbnailUrl: string | null; kind: string; duration: number | null; createdAt: string }

function fmtDuration(s: number | null) {
  if (s == null) return "";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

/**
 * What this tool saved to the user's Assets lately. `refreshKey` changes when
 * a new result lands so the strip picks it up.
 */
export function RecentResults({ source, label = "Recent", refreshKey }: { source: string; label?: string; refreshKey?: unknown }) {
  const { token } = useAuth();
  const [items, setItems] = useState<RecentAsset[] | null>(null);

  useEffect(() => {
    if (!token) return;
    let live = true;
    fetch(`/api/assets?source=${encodeURIComponent(source)}&limit=6&excludeFlagged=true`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : { assets: [] }))
      .then((d: { assets?: RecentAsset[] }) => { if (live) setItems(d.assets ?? []); })
      .catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [token, source, refreshKey]);

  if (!token || !items || items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{label}</p>
        <Link href="/dashboard/assets" className="text-[12px] font-medium text-fg-muted hover:text-fg">All in Assets</Link>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {items.map((a) =>
          a.kind === "image" || a.thumbnailUrl ? (
            <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" title={a.name}
               className="relative h-20 w-28 flex-shrink-0 overflow-hidden rounded-lg border border-line bg-surface-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.thumbnailUrl ?? a.url} alt={a.name} className="h-full w-full object-cover" loading="lazy" />
              {a.duration != null && <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] text-white">{fmtDuration(a.duration)}</span>}
            </a>
          ) : (
            <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer"
               className="flex h-20 w-44 flex-shrink-0 flex-col justify-between rounded-lg border border-line bg-surface-1 p-2.5 outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-primary/60">
              <span className="truncate text-[12.5px] font-medium text-fg">{a.name}</span>
              <span className="text-[11px] text-fg-subtle">{a.kind === "audio" ? "Audio" : "Video"}{a.duration != null ? ` · ${fmtDuration(a.duration)}` : ""}</span>
            </a>
          ),
        )}
      </div>
    </div>
  );
}

interface ToolWorkspaceProps {
  title: string;
  icon: ToolIconName;
  badges?: React.ReactNode;
  description?: string;
  /** Inputs and options, top of the left panel. */
  controls: React.ReactNode;
  /** Price, the run button and small print, pinned to the bottom of the left panel. */
  footer?: React.ReactNode;
  stageTitle?: string;
  stageActions?: React.ReactNode;
  /** The result area. */
  stage: React.ReactNode;
  /** Shown under the stage. */
  below?: React.ReactNode;
}

export function ToolWorkspace({ title, icon, badges, description, controls, footer, stageTitle = "Result", stageActions, stage, below }: ToolWorkspaceProps) {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-10 sm:px-8">
      <div className="flex flex-wrap items-stretch gap-5" style={{ minHeight: "calc(100vh - 132px)" }}>
        <aside className="flex min-w-0 flex-[1_1_360px] flex-col gap-5 rounded-2xl border border-line bg-panel p-5 sm:max-w-[460px]">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-line text-fg-muted"><ToolIcon name={icon} className="h-5 w-5" /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[19px] font-bold leading-tight text-fg">{title}</h1>
                {badges}
              </div>
              {description && <p className="mt-1 text-[13px] text-fg-muted">{description}</p>}
            </div>
          </div>
          <div className="flex flex-col gap-5">{controls}</div>
          {footer != null && <div className="mt-auto flex flex-col gap-3 pt-1">{footer}</div>}
        </aside>
        <section aria-label={stageTitle} className="flex min-w-0 flex-[999_1_560px] flex-col gap-4 rounded-2xl border border-line bg-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-fg">{stageTitle}</h2>
            {stageActions}
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{stage}</div>
          {below}
        </section>
      </div>
    </div>
  );
}
