"use client";

import Link from "next/link";
import { Skeleton } from "@/app/components/ui/Skeleton";

// One presentational component for every "Related" surface: the clip
// workspace's Related tab, the asset lightbox, and the asset detail page.
//
// Kept deliberately dumb — it takes already-resolved rows and renders them. The
// three call sites fetch differently (react-query in the clip workspace, a
// route-level fetch on the asset page), and pushing data-loading in here would
// have meant a fourth data layer for assets, which this codebase already has
// too many of.

export function fmtDuration(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** A single tile in a horizontal rail. */
export interface RailItem {
  id: string;
  title: string;
  /** Small line under the title — duration, size, status. */
  meta?: string;
  thumbnailUrl?: string | null;
  /** 0–99 virality score, rendered as a badge. */
  score?: number | null;
  href?: string;
  onClick?: () => void;
}

/** A single row in a compact list. */
export interface ListItem {
  id: string;
  title: string;
  meta?: string;
  href?: string;
  /** Renders as an external link with the appropriate rel. */
  external?: boolean;
}

export function RelatedSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-soft/70">{title}</h3>
        {count !== undefined && count > 0 && (
          <span className="text-[11px] font-semibold text-ink-soft/50">{count}</span>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Score badge. Deliberately shows the number: the composite score is computed,
 * calibrated against the rendered audio and stored, but the results grid only
 * ever showed a vague band label ("High potential"), so the actual figure was
 * invisible to the user whose clip it describes.
 */
function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 80 ? "bg-tint-emerald text-emerald-700"
      : score >= 60 ? "bg-tint-blue text-brand"
        : "bg-tint-amber text-amber-700";
  return (
    <span className={`absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tone}`}>
      {score}
    </span>
  );
}

function RailTile({ item }: { item: RailItem }) {
  const inner = (
    <>
      <div className="relative aspect-[9/16] w-full rounded-xl overflow-hidden bg-gradient-to-br from-tint-violet to-tint-fuchsia">
        {item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6 text-accent-violet/40">
              <path d="M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
        {typeof item.score === "number" && <ScoreBadge score={item.score} />}
      </div>
      <p className="mt-1.5 text-[11px] font-semibold text-ink line-clamp-2 leading-snug">{item.title}</p>
      {item.meta && <p className="text-[10px] text-ink-soft/70 mt-0.5">{item.meta}</p>}
    </>
  );

  const className = "shrink-0 w-[104px] text-left cursor-pointer group";

  if (item.href) {
    return (
      <Link href={item.href} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={item.onClick} className={className}>
      {inner}
    </button>
  );
}

/** Horizontal thumbnail strip. Scrolls inside itself — never the page. */
export function RelatedRail({ items }: { items: RailItem[] }) {
  return (
    <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
      {items.map((item) => (
        <RailTile key={item.id} item={item} />
      ))}
    </div>
  );
}

/** Compact rows, for things without a useful thumbnail. */
export function RelatedList({ items }: { items: ListItem[] }) {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const body = (
          <>
            <span className="text-xs font-semibold text-ink truncate">{item.title}</span>
            {item.meta && <span className="text-[11px] text-ink-soft/70 shrink-0">{item.meta}</span>}
          </>
        );
        const rowClass =
          "flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-surface hover:bg-tint-blue transition-colors";

        if (!item.href) {
          return (
            <li key={item.id} className={rowClass}>
              {body}
            </li>
          );
        }
        return (
          <li key={item.id}>
            {item.external ? (
              <a href={item.href} target="_blank" rel="noopener noreferrer" className={rowClass}>
                {body}
              </a>
            ) : (
              <Link href={item.href} className={rowClass}>
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The clip's window inside its source, as a proportional bar. Answers "where
 * in the video did this come from?", which the workspace could not say at all
 * — it showed no source name, no timestamp and no way back.
 */
export function SourceWindowBar({
  startSec,
  endSec,
  sourceDurationSec,
}: {
  startSec: number;
  endSec: number;
  sourceDurationSec: number | null;
}) {
  // Without a known source duration a proportional bar would be a lie, so show
  // the timestamps alone rather than inventing a scale.
  if (!sourceDurationSec || sourceDurationSec <= 0) {
    return (
      <p className="text-[11px] text-ink-soft">
        {fmtDuration(startSec)} – {fmtDuration(endSec)} in the source
      </p>
    );
  }

  const left = Math.max(0, Math.min(100, (startSec / sourceDurationSec) * 100));
  const width = Math.max(1.5, Math.min(100 - left, ((endSec - startSec) / sourceDurationSec) * 100));

  return (
    <div className="space-y-1">
      <div className="relative h-2 rounded-full bg-tint-blue overflow-hidden">
        <div
          className="absolute inset-y-0 rounded-full"
          style={{ left: `${left}%`, width: `${width}%`, background: "var(--gradient-brand)" }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-ink-soft/70 tabular-nums">
        <span>0:00</span>
        <span className="font-semibold text-ink-soft">
          {fmtDuration(startSec)} – {fmtDuration(endSec)}
        </span>
        <span>{fmtDuration(sourceDurationSec)}</span>
      </div>
    </div>
  );
}

export function RelatedEmpty({ message }: { message: string }) {
  return (
    <p className="text-xs text-ink-soft/70 px-3 py-4 rounded-xl bg-surface text-center">{message}</p>
  );
}

export function RelatedLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-3 w-24" />
      <div className="flex gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="w-[104px] h-[185px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
