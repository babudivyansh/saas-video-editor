"use client";

import Link from "next/link";
import { CardMenuButton } from "@/app/components/dashboard/CardMenuButton";
import type { ClipRow } from "../hooks/useClipsLibrary";

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function IcStar({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Score badge — the actual number.
 *
 * The score is computed by the pick, then recalibrated against the rendered
 * clip's own audio, and stored. The results grid only ever rendered a band
 * label ("Good potential"), so the figure the whole ranking is built on was
 * never shown to the person it describes.
 */
function Score({ score }: { score: number }) {
  const tone =
    score >= 80 ? "bg-tint-emerald text-emerald-700"
      : score >= 60 ? "bg-tint-blue text-brand"
        : "bg-tint-amber text-amber-700";
  return (
    <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full ${tone}`} title="Virality score out of 99">
      {score}
    </span>
  );
}

function StatusOverlay({ clip }: { clip: ClipRow }) {
  if (clip.status === "ready") return null;

  if (clip.status === "failed") {
    return (
      <div className="absolute inset-0 bg-bg/85 flex flex-col items-center justify-center gap-1 px-3 text-center">
        <span className="text-[11px] font-bold text-error">Render failed</span>
        {/* Clip.failureReason exists now — previously the UI could only ever
            say "Failed to render" with no explanation. */}
        {clip.failureReason && (
          <span className="text-[10px] text-ink-soft line-clamp-3">{clip.failureReason}</span>
        )}
      </div>
    );
  }

  if (clip.status === "pending_review") {
    return (
      <div className="absolute inset-0 bg-bg/85 flex items-center justify-center">
        <span className="text-[11px] font-bold text-ink-soft">Awaiting review</span>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-bg/85 flex flex-col items-center justify-center gap-2 px-4">
      <span className="text-[11px] font-bold text-ink-soft">Rendering {clip.progress}%</span>
      <div className="h-1 w-full bg-surface-3 rounded-full overflow-hidden">
        <div className="h-full grad-brand rounded-full transition-all" style={{ width: `${clip.progress}%` }} />
      </div>
    </div>
  );
}

export function ClipCard({
  clip,
  onToggleFavorite,
  onMenu,
}: {
  clip: ClipRow;
  onToggleFavorite: () => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  const title = clip.title || `Clip ${clip.index + 1}`;

  return (
    <div className="group relative rounded-[var(--radius-card)] border border-card-border bg-panel overflow-hidden hover:border-violet-200 transition-colors">
      <CardMenuButton label="Clip actions" onClick={onMenu} />

      <Link
        href={`/dashboard/create/auto-clip?project=${clip.projectId}&clip=${clip.id}`}
        className="block"
      >
        <div className="relative aspect-[9/16] bg-gradient-to-br from-tint-violet to-tint-fuchsia overflow-hidden">
          {clip.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clip.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8 text-accent-violet/40">
                <path d="M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}

          <span className="absolute bottom-2 right-2 text-[10px] font-bold text-white bg-black/55 rounded-full px-2 py-0.5 tabular-nums">
            {fmtDuration(clip.durationSec)}
          </span>

          <StatusOverlay clip={clip} />
        </div>
      </Link>

      <div className="p-3 space-y-1.5">
        <div className="flex items-start gap-2">
          <p className="flex-1 text-[12.5px] font-semibold text-ink line-clamp-2 leading-snug">{title}</p>
          {typeof clip.score === "number" && <Score score={clip.score} />}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/dashboard/create/auto-clip?project=${clip.projectId}`}
            className="text-[11px] text-ink-soft/70 truncate hover:text-brand transition-colors"
            title={clip.projectTitle}
          >
            {clip.projectTitle}
          </Link>
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-label={clip.isFavorite ? "Remove from favourites" : "Add to favourites"}
            aria-pressed={clip.isFavorite}
            className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              clip.isFavorite
                ? "text-warning bg-tint-amber"
                : "text-ink-soft/40 hover:text-ink-soft hover:bg-tint-blue"
            }`}
          >
            <IcStar filled={clip.isFavorite} />
          </button>
        </div>
      </div>
    </div>
  );
}
