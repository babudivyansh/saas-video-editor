"use client";

import { useState } from "react";
import { Checkbox } from "@/app/components/ui/Checkbox";
import type { Asset } from "../types";

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtDur(s: number | null) {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function IcStar({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IcFlag() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="4" y1="22" x2="4" y2="15" strokeLinecap="round" />
    </svg>
  );
}

interface AssetCardProps {
  asset: Asset;
  selected: boolean;
  selectionActive: boolean;
  isRenaming: boolean;
  renameVal: string;
  onSelect: (e: React.MouseEvent) => void;
  onOpenPreview: () => void;
  onRenameStart: () => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onToggleFavorite: () => void;
  onCopyUrl: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStartAsset: (e: React.DragEvent) => void;
}

export function AssetCard({
  asset, selected, selectionActive, isRenaming, renameVal,
  onSelect, onOpenPreview, onRenameStart, onRenameChange, onRenameCommit, onRenameCancel,
  onToggleFavorite, onCopyUrl, onContextMenu, onDragStartAsset,
}: AssetCardProps) {
  const [imgError, setImgError] = useState(false);
  const flagged = asset.moderationStatus === "flagged";
  const thumb = asset.thumbnailUrl && !imgError ? asset.thumbnailUrl : null;

  return (
    <div
      draggable
      onDragStart={onDragStartAsset}
      onContextMenu={onContextMenu}
      onClick={(e) => { if (selectionActive || e.metaKey || e.ctrlKey || e.shiftKey) onSelect(e); else onOpenPreview(); }}
      className={`group relative flex flex-col bg-white rounded-[var(--radius-card)] border overflow-hidden transition-all hover:shadow-card-hover hover:-translate-y-0.5 cursor-pointer ${
        selected ? "border-brand ring-2 ring-violet-200" : "border-card-border hover:border-violet-200"
      }`}
    >
      {/* Selection checkbox */}
      <div className={`absolute top-2 left-2 z-10 transition-opacity ${selectionActive || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
        <Checkbox checked={selected} onChange={() => onSelect({ stopPropagation: () => {} } as React.MouseEvent)} label={`Select ${asset.name}`} />
      </div>

      {/* Thumbnail */}
      <div className="relative aspect-video bg-gray-50 flex items-center justify-center overflow-hidden">
        {asset.status === "failed" ? (
          <div className="w-full h-full bg-tint-rose flex flex-col items-center justify-center gap-1 px-3 text-center text-rose-700">
            <span className="text-[11px] font-bold">Couldn&apos;t be processed</span>
            <span className="text-[10px] text-rose-600/80">This file can&apos;t be used. Try uploading it again.</span>
          </div>
        ) : asset.status === "processing" ? (
          <div className="w-full h-full bg-tint-blue flex flex-col items-center justify-center gap-2 text-ink-soft">
            <span className="w-4 h-4 rounded-full border-2 border-brand border-t-transparent animate-spin" />
            <span className="text-[10px] font-semibold">Processing…</span>
          </div>
        ) : flagged ? (
          <div className="w-full h-full bg-gray-100 flex flex-col items-center justify-center gap-1 text-gray-400">
            <IcFlag />
            <span className="text-[10px] font-semibold">Under review</span>
          </div>
        ) : asset.kind === "video" ? (
          thumb ? (
            <img src={thumb} alt={asset.name} loading="lazy" className="w-full h-full object-cover" onError={() => setImgError(true)} />
          ) : (
            <video src={asset.url} className="w-full h-full object-cover" muted preload="metadata"
              onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
              onMouseLeave={(e) => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0; }} />
          )
        ) : asset.kind === "image" ? (
          <img src={asset.url} alt={asset.name} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-tint-violet to-tint-fuchsia flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-accent-violet/40">
              <path d="M9 18V5l12-2v13M6 21a3 3 0 100-6 3 3 0 000 6zM18 19a3 3 0 100-6 3 3 0 000 6z" />
            </svg>
          </div>
        )}

        <div className={`absolute bottom-2 left-2 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide text-white
          ${asset.kind === "video" ? "bg-brand" : asset.kind === "audio" ? "bg-accent-violet" : "bg-emerald-500"}`}
        >
          {asset.kind}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          title={asset.isFavorite ? "Remove from favorites" : "Add to favorites"}
          className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            asset.isFavorite ? "bg-amber-400 text-white opacity-100" : "bg-white/90 text-gray-500 opacity-0 group-hover:opacity-100 hover:text-amber-500"
          }`}
        >
          <IcStar filled={asset.isFavorite} />
        </button>

        {!flagged && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button onClick={(e) => { e.stopPropagation(); onCopyUrl(); }} title="Copy URL"
              className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition-colors cursor-pointer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-gray-700">
                <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </button>
            <button onClick={(e) => { e.stopPropagation(); onRenameStart(); }} title="Rename"
              className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition-colors cursor-pointer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-gray-700">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" />
              </svg>
            </button>
            <button onClick={onContextMenu} title="More"
              className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition-colors cursor-pointer">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-gray-700">
                <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-3 py-2.5">
        {isRenaming ? (
          <input
            autoFocus
            onClick={(e) => e.stopPropagation()}
            className="w-full text-xs font-medium border border-violet-400 rounded-lg px-1.5 py-0.5 outline-none text-ink focus:ring-2 focus:ring-violet-100"
            value={renameVal}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onRenameCommit(); if (e.key === "Escape") onRenameCancel(); }}
            onBlur={onRenameCommit}
          />
        ) : (
          <p className="text-xs font-medium text-ink truncate">{asset.name}</p>
        )}
        <p className="text-[10px] text-ink-soft/70 mt-0.5">
          {fmtSize(asset.size)}
          {asset.duration ? ` · ${fmtDur(asset.duration)}` : ""}
          {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}
        </p>
        {asset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {asset.tags.slice(0, 3).map((t) => (
              <span key={t.id} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-tint-violet text-accent-violet">{t.name}</span>
            ))}
            {asset.tags.length > 3 && <span className="text-[9px] text-ink-soft/60">+{asset.tags.length - 3}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
