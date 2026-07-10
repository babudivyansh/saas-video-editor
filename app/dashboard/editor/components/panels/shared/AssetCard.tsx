"use client";

// Shared card for the Media/Stock/Sticker asset grids, plus the row variant
// used by Stock Audio's list layout. `thumb` is caller-provided (video/img/
// icon element) so this component stays agnostic to media type.

import React from "react";

export default function AssetCard({
  thumb,
  title,
  durationLabel,
  onClick,
  adding,
  attribution,
  layout = "grid",
  aspect = "video",
}: {
  thumb: React.ReactNode;
  title?: string;
  durationLabel?: string;
  onClick: () => void;
  adding?: boolean;
  attribution?: string;
  layout?: "grid" | "row";
  aspect?: "video" | "square";
}) {
  if (layout === "row") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={adding}
        title={attribution}
        className="flex items-center gap-2.5 rounded-editor-md border border-editor-border bg-editor-card px-2.5 py-2 text-left transition-colors hover:border-editor-accent disabled:opacity-50 cursor-pointer"
      >
        <span className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-editor-sm">{thumb}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-editor-text">{title}</span>
          <span className="text-[10px] text-editor-text-faint">{adding ? "Adding…" : durationLabel}</span>
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={adding}
      title={attribution}
      className="group overflow-hidden rounded-editor-md border border-editor-border bg-editor-card text-left transition-colors hover:border-editor-accent disabled:opacity-50 cursor-pointer"
    >
      <div
        className={`relative flex ${aspect === "square" ? "aspect-square" : "aspect-video"} items-center justify-center bg-black`}
      >
        {thumb}
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-xs font-semibold text-white opacity-0 transition-all group-hover:bg-black/50 group-hover:opacity-100">
          {adding ? "Adding…" : "+ Add"}
        </span>
        {durationLabel && (
          <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[9px] text-editor-text">
            {durationLabel}
          </span>
        )}
      </div>
      {title && <p className="truncate px-1.5 py-1 text-[10px] font-medium text-editor-text-muted">{title}</p>}
    </button>
  );
}
