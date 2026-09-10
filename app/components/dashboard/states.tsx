"use client";

// Loading, error and health states shared by dashboard surfaces.
//
// The discipline these encode, from the admin dashboard: a skeleton is sized to
// the content it replaces and sits in the SAME grid cell, so nothing shifts when
// the data lands. An error is a card in the same cell, not a page-level banner
// that discards the sections that did load.

export function Skeleton({ h = "h-40" }: { h?: string }) {
  return <div className={`bg-surface-3 rounded-[var(--radius-card)] animate-pulse ${h}`} aria-label="Loading" />;
}

export function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="bg-panel rounded-[var(--radius-card)] border border-line shadow-sm p-6 text-center">
      <p className="text-sm text-fg-muted mb-2">Couldn&rsquo;t load this section.</p>
      <button onClick={onRetry} className="text-xs font-semibold text-brand cursor-pointer">
        Retry
      </button>
    </div>
  );
}

export function HealthDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${ok ? "bg-success" : "bg-error"}`} aria-hidden />
      <span className={ok ? "text-fg-muted" : "text-error font-semibold"}>{label}</span>
      <span className="sr-only">{ok ? "healthy" : "attention needed"}</span>
    </div>
  );
}
