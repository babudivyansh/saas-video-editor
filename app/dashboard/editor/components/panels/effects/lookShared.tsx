"use client";

// Shared bits for the Effects / Filters / Transitions tabs: which video clip
// they act on, a still frame from it (so every tile previews on YOUR footage,
// not a stock GIF), the "editing Clip N" chip, and the empty state that
// offers to pick the first clip instead of just saying "select one".

import React from "react";
import { Film } from "lucide-react";
import { useEditorStore } from "../../../store/editorStore";
import { useAssets, fmtDuration } from "../shared/assetData";
import { useVideoThumbnails } from "../../../hooks/useVideoThumbnails";
import { playUiSound } from "../../../hooks/useUiSound";
import type { VideoClip } from "@/lib/editor/types";

export function useLookTarget() {
  const selection = useEditorStore((s) => s.selection);
  const clips = useEditorStore((s) => s.doc.tracks.video);
  const { assets } = useAssets("video");
  const index = selection?.track === "video" ? clips.findIndex((c) => c.id === selection.clipId) : -1;
  const clip: VideoClip | null = index >= 0 ? clips[index] : null;
  const url = clip ? assets.find((a) => a.id === clip.assetId)?.url ?? null : null;
  const frames = useVideoThumbnails(url, 3);
  // A captured still when the filmstrip hook managed one; otherwise the clip
  // itself as a paused <video> (no canvas capture needed, so no CORS taint).
  const still = frames[1] ?? frames[0] ?? null;
  const frame: LookSource | null = still ? { kind: "image", src: still } : url ? { kind: "video", src: `${url}#t=${(clip?.srcIn ?? 0) + 0.5}` } : null;
  return { clip, index, clipCount: clips.length, frame, firstClip: clips[0] ?? null };
}

export type LookSource = { kind: "image" | "video"; src: string };

/** The still a tile animates — the clip's own frame, or a neutral block while it loads. */
export function LookFrame({ src, className = "", style }: { src: LookSource | null; className?: string; style?: React.CSSProperties }) {
  if (src?.kind === "video") {
    return <video src={src.src} muted playsInline preload="metadata" aria-hidden="true" className={`absolute inset-0 h-full w-full object-cover ${className}`} style={style} />;
  }
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src.src} alt="" draggable={false} className={`absolute inset-0 h-full w-full object-cover ${className}`} style={style} />
  ) : (
    <span className={`absolute inset-0 bg-[#5c4a33] ${className}`} style={style} />
  );
}

export function ClipChip({ clip, index, frame, note }: { clip: VideoClip; index: number; frame: LookSource | null; note: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-editor-md border border-editor-border bg-editor-card px-2.5 py-2">
      <span className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-editor-sm">
        <LookFrame src={frame} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold text-editor-text">Clip {index + 1}</span>
        <span className="block text-[11px] text-editor-text-faint">
          {fmtDuration(clip.timelineStart)} – {fmtDuration(clip.timelineStart + clip.duration)} · {note}
        </span>
      </span>
    </div>
  );
}

export function NoClipSelected({ what, firstClip }: { what: string; firstClip: VideoClip | null }) {
  const select = useEditorStore((s) => s.select);
  return (
    <div className="flex flex-col items-center gap-3 rounded-editor-lg border border-dashed border-editor-border-strong px-4 py-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-editor-accent/12 text-editor-accent">
        <Film className="h-5 w-5" />
      </span>
      <p className="text-[12.5px] leading-snug text-editor-text-muted">Select a video clip on the timeline to {what}.</p>
      {firstClip && (
        <button
          type="button"
          onClick={() => {
            select({ track: "video", clipId: firstClip.id });
            playUiSound("tap");
          }}
          className="editor-press rounded-editor-md border border-editor-border-strong bg-editor-card px-3 py-1.5 text-[12px] font-semibold text-editor-text hover:border-editor-accent/50"
        >
          Use the first clip
        </button>
      )}
    </div>
  );
}

/** One preset tile: a frame from the clip plus whatever preview the caller layers on top. */
export function LookTile({
  label,
  active,
  onClick,
  className,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`${className} group flex flex-col text-left cursor-pointer`}>
      <span
        className={`editor-tile relative block aspect-square overflow-hidden rounded-editor-md border ${
          active ? "border-editor-accent shadow-[0_0_18px_rgba(32,214,138,0.3)] ring-2 ring-editor-accent/60" : "border-editor-border group-hover:border-editor-accent/40"
        }`}
      >
        {children}
        {active && (
          <span className="editor-pop absolute right-1.5 top-1.5 z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-editor-accent text-editor-bg">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
          </span>
        )}
      </span>
      <span className={`mt-1.5 truncate text-[11px] font-medium ${active ? "text-editor-accent" : "text-editor-text-muted group-hover:text-editor-text"}`}>{label}</span>
    </button>
  );
}
