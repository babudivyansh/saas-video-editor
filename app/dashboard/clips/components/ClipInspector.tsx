"use client";

import Link from "next/link";
import type { ClipRow } from "../hooks/useClipsLibrary";
import {
  ClipStatusChip, IcDownload, IcFilm, IcPen, IcStar, IcTrash, IcVideo,
  clipHref, clipTitle, fmtDuration, scoreTone,
} from "./clipUi";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const ASPECT: Record<string, string> = { "9:16": "aspect-[9/16] w-[169px]", "1:1": "aspect-square w-[260px]", "16:9": "aspect-video w-full" };

/**
 * The right-hand preview panel of the clips library. It plays the clip and
 * holds the actions the old grid hid behind a hover menu.
 */
export function ClipInspector({
  clip, rank, total, onToggleFavorite, onRename, onDelete,
}: {
  clip: ClipRow;
  /** 1-based position by score among the clips loaded, or null when unknown. */
  rank: number | null;
  total: number;
  onToggleFavorite: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const title = clipTitle(clip);
  const hasScore = typeof clip.score === "number";
  const tone = hasScore ? scoreTone(clip.score!) : null;
  const ready = clip.status === "ready";
  const frame = ASPECT[clip.aspectRatio] ?? ASPECT["9:16"];

  return (
    <aside
      aria-label="Clip preview"
      className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-line bg-surface-1 p-5 max-h-[calc(100dvh-7rem)] overflow-y-auto"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">Preview</span>
        <span className="font-mono text-xs text-fg-muted">{fmtDuration(clip.durationSec)} · {clip.aspectRatio}</span>
      </div>

      <div className={`relative mx-auto ${frame} max-h-[300px] rounded-2xl overflow-hidden border border-line-strong bg-bg`}>
        {ready && clip.videoUrl ? (
          // key: a new clip must load a new source, not keep the old one playing.
          <video
            key={clip.id}
            src={clip.videoUrl}
            poster={clip.thumbnailUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
          />
        ) : clip.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={clip.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-fg-subtle"><IcVideo className="w-8 h-8" /></div>
        )}
        {!ready && (
          <div className="absolute inset-0 bg-bg/80 flex flex-col items-center justify-center gap-2 px-4 text-center">
            {clip.status === "failed" ? (
              <span className="text-sm font-bold text-error">Render failed</span>
            ) : (
              <>
                <span className="text-sm font-semibold text-fg-muted">Rendering {clip.progress}%</span>
                <span className="h-1 w-full bg-surface-3 rounded-full overflow-hidden">
                  <span className="block h-full bg-primary rounded-full transition-all" style={{ width: `${clip.progress}%` }} />
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <h2 className="text-lg font-semibold leading-snug text-fg tracking-tight">{title}</h2>

      <div className="flex flex-col gap-2.5">
        {ready ? (
          // A plain <a>: the route answers with Content-Disposition: attachment,
          // and next/link would try to client-navigate to it.
          <a
            href={`/api/projects/${clip.projectId}/clips/${clip.id}/download`}
            download
            className="inline-flex items-center justify-center gap-2 h-11 rounded-full grad-brand text-on-primary font-semibold shadow-glow hover:brightness-105 outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <IcDownload /> Download clip
          </a>
        ) : (
          <span className="inline-flex items-center justify-center gap-2 h-11 rounded-full bg-surface-3 text-fg-subtle font-semibold">
            <IcDownload /> Download when ready
          </span>
        )}
        <div className="flex items-center gap-2">
          <Link
            href={clipHref(clip)}
            className="flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-full border border-line-strong bg-surface-2 text-fg text-sm font-medium hover:bg-surface-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            <IcPen /> Edit clip
          </Link>
          <IconButton label={clip.isFavorite ? "Remove star" : "Star this clip"} pressed={clip.isFavorite} onClick={onToggleFavorite} active={clip.isFavorite}>
            <IcStar filled={clip.isFavorite} />
          </IconButton>
          <IconButton label="Rename clip" onClick={onRename}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="w-4 h-4"><path d="M4 7V5h16v2M12 5v14M9 19h6" /></svg></IconButton>
          <IconButton label="Delete clip" onClick={onDelete} danger><IcTrash /></IconButton>
        </div>
      </div>

      {tone && (
        <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface-2 px-4 py-3.5">
          <span className={`text-4xl font-bold tracking-tight ${tone.text}`}>{clip.score}</span>
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-semibold text-fg">Virality score</span>
              <span className="text-fg-muted">{rank ? `#${rank} of ${total}` : "out of 99"}</span>
            </div>
            <span className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <span className={`block h-full rounded-full ${tone.bar}`} style={{ width: `${clip.score}%` }} />
            </span>
          </div>
        </div>
      )}

      {clip.status === "failed" && clip.failureReason && (
        <p className="rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-[13px] text-error">{clip.failureReason}</p>
      )}

      <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-[13px]">
        <dt className="text-fg-subtle">Project</dt>
        <dd className="min-w-0">
          <Link
            href={`/dashboard/create/auto-clip?project=${clip.projectId}`}
            className="inline-flex items-center gap-1.5 max-w-full text-primary hover:text-primary-hover"
            title={clip.projectTitle}
          >
            <IcFilm className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{clip.projectTitle}</span>
          </Link>
        </dd>
        <dt className="text-fg-subtle">Length</dt>
        <dd className="text-fg tabular-nums">{fmtDuration(clip.durationSec)}</dd>
        <dt className="text-fg-subtle">Format</dt>
        <dd className="text-fg">{clip.aspectRatio}</dd>
        <dt className="text-fg-subtle">Status</dt>
        <dd><ClipStatusChip clip={clip} /></dd>
        <dt className="text-fg-subtle">Created</dt>
        <dd className="text-fg">{fmtDate(clip.createdAt)}</dd>
      </dl>

    </aside>
  );
}

function IconButton({
  label, onClick, children, pressed, active, danger,
}: {
  label: string; onClick: () => void; children: React.ReactNode; pressed?: boolean; active?: boolean; danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`w-10 h-10 shrink-0 rounded-full border border-line flex items-center justify-center transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
        active ? "text-warning" : danger ? "text-fg-muted hover:text-error hover:border-error/40" : "text-fg-muted hover:text-fg hover:bg-surface-3"
      }`}
    >
      {children}
    </button>
  );
}
