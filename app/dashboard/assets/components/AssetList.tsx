"use client";

import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Checkbox } from "@/app/components/ui/Checkbox";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { fmtDuration, fmtSize } from "@/app/components/related/RelatedContent";
import type { Asset } from "../types";

// The list view of the library — the default in the split layout, where the
// details panel on the right does the job the grid's big thumbnails did.
// Virtualised like AssetGrid, because a library can run to thousands of rows.

const COLS = "grid grid-cols-[28px_minmax(0,1fr)_auto] md:grid-cols-[28px_minmax(0,1fr)_84px_80px_60px_76px] gap-3 items-center";

export const KIND_DOT: Record<Asset["kind"], string> = { video: "bg-primary", audio: "bg-warning", image: "bg-info" };
const KIND_LABEL: Record<Asset["kind"], string> = { video: "Video", audio: "Audio", image: "Image" };

interface AssetListProps {
  assets: Asset[];
  loading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  inspectedId: string | null;
  selectedIds: Set<string>;
  selectionActive: boolean;
  onSelect: (asset: Asset, e: React.MouseEvent) => void;
  onActivate: (asset: Asset) => void;
  renamingId: string | null;
  renameVal: string;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onToggleFavorite: (asset: Asset) => void;
  onContextMenu: (e: React.MouseEvent, asset: Asset) => void;
  onDragStartAsset: (e: React.DragEvent, asset: Asset) => void;
  emptyTitle: string;
  emptySubtitle: string;
  emptyAction?: { label: string; onClick: () => void };
}

export function AssetList({
  assets, loading, hasNextPage, isFetchingNextPage, onLoadMore,
  inspectedId, selectedIds, selectionActive, onSelect, onActivate,
  renamingId, renameVal, onRenameChange, onRenameCommit, onRenameCancel,
  onToggleFavorite, onContextMenu, onDragStartAsset,
  emptyTitle, emptySubtitle, emptyAction,
}: AssetListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: assets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 74,
    overscan: 8,
  });
  const items = virtualizer.getVirtualItems();
  const lastIndex = items[items.length - 1]?.index;

  useEffect(() => {
    if (lastIndex !== undefined && lastIndex >= assets.length - 6 && hasNextPage && !isFetchingNextPage) onLoadMore();
  }, [lastIndex, assets.length, hasNextPage, isFetchingNextPage, onLoadMore]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[66px] rounded-2xl" />)}
      </div>
    );
  }
  if (assets.length === 0) {
    return (
      <EmptyState
        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" /></svg>}
        title={emptyTitle}
        subtitle={emptySubtitle}
        action={emptyAction}
      />
    );
  }

  return (
    <div>
      <div className={`${COLS} hidden md:grid px-3 pb-2.5 border-b border-line text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle`}>
        <span />
        <span>Name</span>
        <span>Type</span>
        <span>Size</span>
        <span>Length</span>
        <span className="sr-only">Actions</span>
      </div>
      <div ref={parentRef} className="h-[calc(100dvh-420px)] min-h-[360px] overflow-y-auto pt-1.5">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
          {items.map((row) => {
            const asset = assets[row.index];
            return (
              <div
                key={asset.id}
                ref={virtualizer.measureElement}
                data-index={row.index}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${row.start}px)`, paddingBottom: 4 }}
              >
                <AssetRow
                  asset={asset}
                  inspected={asset.id === inspectedId}
                  selected={selectedIds.has(asset.id)}
                  selectionActive={selectionActive}
                  onSelect={(e) => onSelect(asset, e)}
                  onActivate={() => onActivate(asset)}
                  isRenaming={renamingId === asset.id}
                  renameVal={renameVal}
                  onRenameChange={onRenameChange}
                  onRenameCommit={onRenameCommit}
                  onRenameCancel={onRenameCancel}
                  onToggleFavorite={() => onToggleFavorite(asset)}
                  onContextMenu={(e) => onContextMenu(e, asset)}
                  onDragStart={(e) => onDragStartAsset(e, asset)}
                />
              </div>
            );
          })}
        </div>
        {isFetchingNextPage && <p className="text-center text-xs text-fg-subtle py-3">Loading more…</p>}
      </div>
    </div>
  );
}

function AssetRow({
  asset, inspected, selected, selectionActive, onSelect, onActivate,
  isRenaming, renameVal, onRenameChange, onRenameCommit, onRenameCancel,
  onToggleFavorite, onContextMenu, onDragStart,
}: {
  asset: Asset;
  inspected: boolean;
  selected: boolean;
  selectionActive: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onActivate: () => void;
  isRenaming: boolean;
  renameVal: string;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onToggleFavorite: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const flagged = asset.moderationStatus === "flagged";
  const thumb = asset.kind === "image" ? asset.url : asset.thumbnailUrl;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onContextMenu={onContextMenu}
      className={`group relative ${COLS} px-3 py-2.5 rounded-2xl border transition-colors ${
        selected ? "bg-primary/5 border-primary/40" : inspected ? "bg-surface-2 border-primary/30" : "border-transparent hover:bg-surface-1"
      }`}
    >
      {/* Stretched button: a plain click opens the file in the details panel,
          a modifier click (or any click while a selection exists) adds it to
          the selection — the same rules the grid cards follow. */}
      <button
        type="button"
        aria-label={asset.name}
        aria-pressed={inspected}
        onClick={(e) => { if (selectionActive || e.metaKey || e.ctrlKey || e.shiftKey) onSelect(e); else onActivate(); }}
        className="absolute inset-0 rounded-2xl cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
      />

      <div className={`relative z-10 transition-opacity ${selectionActive || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}>
        <Checkbox checked={selected} onChange={() => onSelect({ stopPropagation: () => {} } as React.MouseEvent)} label={`Select ${asset.name}`} />
      </div>

      <div className="flex items-center gap-3 min-w-0">
        <div className="relative w-20 aspect-video rounded-lg overflow-hidden bg-surface-3 border border-line shrink-0 pointer-events-none">
          {thumb && !imgError && !flagged ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" loading="lazy" className="w-full h-full object-cover" onError={() => setImgError(true)} />
          ) : asset.kind === "video" && asset.status === "ready" && !flagged ? (
            // No stored thumbnail: let the browser pull the first frame, as
            // the grid card does. #t skips a black opening frame.
            <video src={`${asset.url}#t=0.1`} muted preload="metadata" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-fg-subtle">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                {asset.kind === "audio"
                  ? <path d="M9 18V5l12-2v13M6 21a3 3 0 100-6 3 3 0 000 6zM18 19a3 3 0 100-6 3 3 0 000 6z" />
                  : <path d="M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />}
              </svg>
            </div>
          )}
        </div>
        <div className="min-w-0 flex flex-col gap-1">
          {isRenaming ? (
            <input
              autoFocus
              aria-label="File name"
              className="relative z-10 w-full text-sm font-semibold bg-surface-2 border border-primary/60 rounded-lg px-2 py-1 outline-none text-fg"
              value={renameVal}
              onChange={(e) => onRenameChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onRenameCommit(); if (e.key === "Escape") onRenameCancel(); }}
              onBlur={onRenameCommit}
            />
          ) : (
            <p className="text-sm font-semibold text-fg truncate pointer-events-none" title={asset.name}>{asset.name}</p>
          )}
          <p className="flex items-center gap-2 text-xs text-fg-subtle pointer-events-none md:hidden">
            {KIND_LABEL[asset.kind]} · {fmtSize(asset.size)}{asset.duration ? ` · ${fmtDuration(asset.duration)}` : ""}
          </p>
          <RowStatus asset={asset} />
        </div>
      </div>

      <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold text-fg-muted pointer-events-none">
        <span className={`w-1.5 h-1.5 rounded-full ${KIND_DOT[asset.kind]}`} />{KIND_LABEL[asset.kind]}
      </span>
      <span className="hidden md:block font-mono text-xs text-fg-muted tabular-nums pointer-events-none">{fmtSize(asset.size)}</span>
      <span className="hidden md:block font-mono text-xs text-fg-muted tabular-nums pointer-events-none">{asset.duration ? fmtDuration(asset.duration) : "—"}</span>

      <div className="relative z-10 flex items-center justify-end gap-0.5">
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-label={asset.isFavorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={asset.isFavorite}
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
            asset.isFavorite ? "text-warning" : "text-fg-subtle hover:text-fg hover:bg-surface-3"
          }`}
        >
          <svg viewBox="0 0 24 24" fill={asset.isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" className="w-4 h-4">
            <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onContextMenu}
          aria-label="File actions"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-fg-subtle hover:text-fg hover:bg-surface-3 transition-colors cursor-pointer"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
        </button>
      </div>
    </div>
  );
}

/** Processing / failed / under-review — otherwise nothing. */
function RowStatus({ asset }: { asset: Asset }) {
  if (asset.status === "failed") return <span className="text-[11px] font-semibold text-error pointer-events-none">Couldn&apos;t be processed</span>;
  if (asset.status === "processing") return <span className="text-[11px] font-semibold text-fg-muted pointer-events-none">Processing…</span>;
  if (asset.moderationStatus === "flagged") return <span className="text-[11px] font-semibold text-warning pointer-events-none">Under review</span>;
  return null;
}
