"use client";

import type { ClipRow } from "../hooks/useClipsLibrary";

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function clipTitle(clip: ClipRow): string {
  return clip.title || `Clip ${clip.index + 1}`;
}

export function clipHref(clip: ClipRow): string {
  return `/dashboard/create/auto-clip?project=${clip.projectId}&clip=${clip.id}`;
}

/**
 * Score colour bands. The score is computed by the pick, recalibrated against
 * the rendered clip's own audio, and stored — it is the number the whole
 * ranking is built on, so it is shown as a figure, not a band label.
 */
export function scoreTone(score: number): { text: string; bar: string } {
  if (score >= 80) return { text: "text-primary", bar: "bg-primary" };
  if (score >= 60) return { text: "text-success", bar: "bg-success" };
  return { text: "text-warning", bar: "bg-warning" };
}

export function ClipStatusChip({ clip }: { clip: ClipRow }) {
  if (clip.status === "ready") {
    return (
      <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-success/10 text-success text-xs font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-success" /> Ready
      </span>
    );
  }
  if (clip.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-error/10 text-error text-xs font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-error" /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-surface-3 text-fg-muted text-xs font-semibold tabular-nums">
      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> {clip.progress}%
    </span>
  );
}

const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function IcStar({ filled, className = "w-4 h-4" }: { filled?: boolean; className?: string }) {
  return <svg {...svg} fill={filled ? "currentColor" : "none"} className={className}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>;
}
export function IcFilm({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return <svg {...svg} className={className}><path d="M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M16 9h4M4 15h4M16 15h4" /></svg>;
}
export function IcDownload({ className = "w-4 h-4" }: { className?: string }) {
  return <svg {...svg} className={className}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>;
}
export function IcPen({ className = "w-4 h-4" }: { className?: string }) {
  return <svg {...svg} className={className}><path d="M4 20l4-1 11-11-3-3L5 16z" /></svg>;
}
export function IcTrash({ className = "w-4 h-4" }: { className?: string }) {
  return <svg {...svg} className={className}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>;
}
export function IcMore({ className = "w-4 h-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" className={className}><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>;
}
export function IcVideo({ className = "w-6 h-6" }: { className?: string }) {
  return <svg {...svg} strokeWidth={1.5} className={className}><path d="M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>;
}
