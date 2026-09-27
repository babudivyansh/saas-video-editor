"use client";

import Link from "next/link";
import { fmtDuration, fmtSize } from "@/app/components/related/RelatedContent";
import { SOURCE_LABELS } from "./PreviewLightbox";
import { KIND_DOT } from "./AssetList";
import type { Asset } from "../types";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const KIND_LABEL: Record<Asset["kind"], string> = { video: "Video", audio: "Audio", image: "Image" };

const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", className: "w-4 h-4" } as const;

/**
 * The library's right-hand details panel: plays or shows the file, lists what
 * it is and where it came from, and holds the per-file actions that were only
 * reachable from the right-click menu before.
 */
export function AssetInspector({
  asset, archived, onClose, onExpand, onDownload, onOrganize, onToggleFavorite, onArchive, onRestore, onDeletePermanently,
}: {
  asset: Asset;
  archived: boolean;
  onClose: () => void;
  onExpand: () => void;
  onDownload: () => void;
  onOrganize: () => void;
  onToggleFavorite: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDeletePermanently: () => void;
}) {
  const flagged = asset.moderationStatus === "flagged";
  const usable = asset.status === "ready" && !flagged;
  const dims = asset.width && asset.height ? `${asset.width}×${asset.height}` : null;

  return (
    <aside aria-label="File details" className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-line bg-surface-1 p-5 max-h-[calc(100dvh-7rem)] overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">Details</span>
        <div className="flex items-center gap-1">
          <PanelIcon label="Open full preview" onClick={onExpand}><svg {...svg}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg></PanelIcon>
          <PanelIcon label="Close details" onClick={onClose}><svg {...svg}><path d="M6 6l12 12M18 6L6 18" /></svg></PanelIcon>
        </div>
      </div>

      <div className="relative aspect-video rounded-2xl overflow-hidden border border-line-strong bg-bg flex items-center justify-center">
        {!usable ? (
          <span className="text-sm font-semibold text-fg-muted px-6 text-center">
            {asset.status === "failed" ? "This file couldn't be processed. Try uploading it again."
              : asset.status === "processing" ? "Still processing…"
                : "Under review"}
          </span>
        ) : asset.kind === "video" ? (
          <video key={asset.id} src={asset.thumbnailUrl ? asset.url : `${asset.url}#t=0.1`} poster={asset.thumbnailUrl ?? undefined} controls playsInline preload="metadata" className="w-full h-full object-contain" />
        ) : asset.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.url} alt={asset.name} className="w-full h-full object-contain" />
        ) : (
          <audio key={asset.id} src={asset.url} controls preload="metadata" className="w-[90%]" />
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <h2 className="text-lg font-semibold leading-snug text-fg break-words">{asset.name}</h2>
        <div className="flex flex-wrap gap-2">
          <Pill><span className={`w-1.5 h-1.5 rounded-full ${KIND_DOT[asset.kind]}`} />{KIND_LABEL[asset.kind]}</Pill>
          <Pill>{fmtSize(asset.size)}</Pill>
          {asset.duration ? <Pill>{fmtDuration(asset.duration)}</Pill> : null}
          {dims && <Pill>{dims}</Pill>}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {asset.kind === "video" && usable && !archived && (
          <Link
            href={`/dashboard/create/auto-clip?asset=${asset.id}`}
            className="inline-flex items-center justify-center gap-2 h-11 rounded-full grad-brand text-on-primary font-semibold shadow-glow hover:brightness-105 outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <svg {...svg}><path d="M4 4l6 6M4 20l6-6M14 12h6M17 9l3 3-3 3" /></svg> Make clips with AutoClip
          </Link>
        )}
        <div className="flex items-center gap-2">
          <SecondaryButton onClick={onDownload}><svg {...svg}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg> Download</SecondaryButton>
          <SecondaryButton onClick={onOrganize}><svg {...svg}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg> Move &amp; tag</SecondaryButton>
          <PanelIcon label={asset.isFavorite ? "Remove from favorites" : "Add to favorites"} onClick={onToggleFavorite} pressed={asset.isFavorite} tone={asset.isFavorite ? "text-warning" : undefined}>
            <svg {...svg} fill={asset.isFavorite ? "currentColor" : "none"}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>
          </PanelIcon>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1 text-[13px]">
          <Link href={`/dashboard/assets/${asset.id}`} className="font-medium text-primary hover:text-primary-hover">Open detail page</Link>
          {archived ? (
            <span className="flex items-center gap-3">
              <button type="button" onClick={onRestore} className="font-medium text-fg-muted hover:text-fg cursor-pointer">Restore</button>
              <button type="button" onClick={onDeletePermanently} className="font-medium text-error hover:underline cursor-pointer">Delete permanently</button>
            </span>
          ) : (
            <button type="button" onClick={onArchive} className="font-medium text-fg-muted hover:text-error cursor-pointer">Archive</button>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-[13px]">
        <dt className="text-fg-subtle">Folder</dt>
        <dd className="text-fg truncate">{asset.folder?.name ?? <span className="text-fg-subtle">None</span>}</dd>
        <dt className="text-fg-subtle">Tags</dt>
        <dd className="text-fg">
          {asset.tags.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {asset.tags.map((t) => <span key={t.id} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-3 text-fg-muted">{t.name}</span>)}
            </span>
          ) : <span className="text-fg-subtle">None</span>}
        </dd>
        <dt className="text-fg-subtle">Source</dt>
        <dd className="text-fg">{SOURCE_LABELS[asset.sourceFeature] ?? asset.sourceFeature}</dd>
        <dt className="text-fg-subtle">Added</dt>
        <dd className="text-fg">{fmtDate(asset.createdAt)}</dd>
      </dl>

    </aside>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-surface-3 border border-line text-xs text-fg-muted">{children}</span>;
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-full border border-line-strong bg-surface-2 text-fg text-sm font-medium hover:bg-surface-3 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      {children}
    </button>
  );
}

function PanelIcon({
  label, onClick, children, pressed, tone,
}: { label: string; onClick: () => void; children: React.ReactNode; pressed?: boolean; tone?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`w-10 h-10 shrink-0 rounded-full border border-line flex items-center justify-center transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${tone ?? "text-fg-muted hover:text-fg hover:bg-surface-3"}`}
    >
      {children}
    </button>
  );
}
