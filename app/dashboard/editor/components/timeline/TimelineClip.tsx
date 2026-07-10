"use client";

// A clip block on a track: click to select, drag body to move, drag the
// left/right handles to trim. Pointer-capture drag pattern (same approach the
// cut-and-crop tool uses); per-frame changes go through the store's transient
// actions and the whole gesture commits as one undo step on pointer-up.

import React, { useRef, useState } from "react";
import { Pencil, Copy, Trash2, Lock, LockOpen, Eye, EyeOff } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import { snapCandidates, snapTime } from "@/lib/editor/doc-utils";
import { useVideoThumbnails } from "../../hooks/useVideoThumbnails";
import type { AnyClip, TimelineDoc, TrackKind } from "@/lib/editor/types";
import IconButton from "../ui/IconButton";

const TRACK_COLORS: Record<TrackKind, { bg: string; border: string; text: string }> = {
  video: { bg: "bg-editor-track-video/70", border: "border-editor-track-video", text: "text-white" },
  text: { bg: "bg-editor-track-text/80", border: "border-editor-track-text", text: "text-zinc-900" },
  audio: { bg: "bg-editor-track-audio/80", border: "border-editor-track-audio", text: "text-zinc-900" },
  image: { bg: "bg-editor-track-image/80", border: "border-editor-track-image", text: "text-zinc-900" },
  // Unused by this component (caption cues render via the lightweight
  // CaptionTimelineClip instead) — present only to satisfy Record<TrackKind,...>.
  caption: { bg: "bg-editor-track-caption/80", border: "border-editor-track-caption", text: "text-zinc-900" },
};

const SNAP_PX = 8;

type DragMode = "move" | "trim-left" | "trim-right";

export default function TimelineClip({
  clip,
  track,
  assetUrl,
  assetName,
}: {
  clip: AnyClip;
  track: TrackKind;
  assetUrl?: string;
  assetName?: string;
}) {
  const zoom = useEditorStore((s) => s.zoom);
  const selected = useEditorStore((s) => s.selection?.clipId === clip.id);
  const select = useEditorStore((s) => s.select);
  const updateClip = useEditorStore((s) => s.updateClip);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const thumbnails = useVideoThumbnails(track === "video" ? assetUrl ?? null : null);

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const drag = useRef<{
    mode: DragMode;
    startX: number;
    origStart: number;
    origDuration: number;
    before: TimelineDoc;
  } | null>(null);

  const label =
    clip.type === "text" ? clip.name || clip.text || "Text" :
    clip.type === "video" ? "Video" :
    clip.type === "image" ? (assetName ?? "Image") : "Audio";

  const beginDrag = (e: React.PointerEvent, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault();
    select({ clipId: clip.id, track });
    if (clip.locked) return; // still selectable, just no drag/trim
    drag.current = {
      mode,
      startX: e.clientX,
      origStart: clip.timelineStart,
      origDuration: clip.duration,
      before: structuredClone(useEditorStore.getState().doc),
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const commitRename = () => {
    updateClip(track, clip.id, { name: renameValue }, true);
    setRenaming(false);
  };

  // The hover toolbar can appear on a hovered-but-not-yet-selected clip —
  // select() first (zustand's set/get are synchronous) so duplicateSelected/
  // deleteSelected act on the clip the user is actually pointing at.
  const duplicateThis = () => {
    select({ clipId: clip.id, track });
    duplicateSelected();
  };
  const deleteThis = () => {
    select({ clipId: clip.id, track });
    deleteSelected();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const s = useEditorStore.getState();
    const deltaSec = (e.clientX - d.startX) / zoom;
    const tolerance = s.snapEnabled ? SNAP_PX / zoom : 0;
    const candidates = s.snapEnabled ? [...snapCandidates(s.doc, clip.id), s.currentTime] : [];

    if (d.mode === "move") {
      let newStart = Math.max(0, d.origStart + deltaSec);
      if (tolerance) {
        // Snap either edge of the moving clip.
        const snappedStart = snapTime(newStart, candidates, tolerance);
        const snappedEnd = snapTime(newStart + d.origDuration, candidates, tolerance);
        if (snappedStart !== newStart) newStart = snappedStart;
        else if (snappedEnd !== newStart + d.origDuration) newStart = snappedEnd - d.origDuration;
      }
      if (track === "video") s.moveVideoClipTransient(clip.id, newStart);
      else s.moveOverlayClipTransient(track as "text" | "audio" | "image", clip.id, newStart);
    } else if (d.mode === "trim-left") {
      let t = d.origStart + deltaSec;
      if (tolerance) t = snapTime(t, candidates, tolerance);
      s.trimClipTransient(track, clip.id, "left", t);
    } else {
      let t = d.origStart + d.origDuration + deltaSec;
      if (tolerance) t = snapTime(t, candidates, tolerance);
      s.trimClipTransient(track, clip.id, "right", t);
    }
  };

  const onPointerUp = () => {
    if (drag.current) {
      useEditorStore.getState().commitDrag(drag.current.before);
      drag.current = null;
    }
  };

  const colors = TRACK_COLORS[track];

  return (
    <div
      onPointerDown={(e) => beginDrag(e, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`group/clip absolute bottom-0.5 top-0.5 flex touch-none items-center overflow-hidden rounded-editor-sm border transition-shadow ${
        clip.locked ? "cursor-default" : "cursor-grab"
      } ${colors.bg} ${colors.border} ${clip.hidden ? "opacity-40" : ""} ${
        selected ? "ring-2 ring-editor-accent shadow-editor-glow" : ""
      }`}
      style={{ left: clip.timelineStart * zoom, width: Math.max(clip.duration * zoom, 8) }}
    >
      {/* Filmstrip thumbnails (video clips only) */}
      {track === "video" && thumbnails.length > 0 && (
        <div className="pointer-events-none absolute inset-0 flex">
          {Array.from({ length: Math.max(Math.ceil((clip.duration * zoom) / 44), 1) }).map((_, i) => (
            <div
              key={i}
              className="h-full flex-1 border-r border-black/20 bg-cover bg-center last:border-r-0"
              style={{ backgroundImage: `url(${thumbnails[i % thumbnails.length]})` }}
            />
          ))}
        </div>
      )}
      {/* Text-only hover toolbar: rename/duplicate/delete/lock/hide. Gated on
          track === "text" so video/audio/image clip rows are unaffected. */}
      {track === "text" && !renaming && (
        <div
          className={`pointer-events-none absolute -top-6 left-0 z-10 flex gap-0.5 rounded-editor-sm border border-editor-border bg-editor-elevated p-0.5 shadow-editor-sm transition-opacity ${
            selected ? "opacity-100 pointer-events-auto" : "opacity-0 group-hover/clip:opacity-100 group-hover/clip:pointer-events-auto"
          }`}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <IconButton
            icon={<Pencil className="h-3 w-3" />}
            label="Rename"
            size="sm"
            onClick={() => {
              setRenameValue(clip.name ?? label);
              setRenaming(true);
            }}
          />
          <IconButton icon={<Copy className="h-3 w-3" />} label="Duplicate" size="sm" onClick={duplicateThis} />
          <IconButton icon={<Trash2 className="h-3 w-3" />} label="Delete" size="sm" onClick={deleteThis} />
          <IconButton
            icon={clip.locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
            label={clip.locked ? "Unlock" : "Lock"}
            size="sm"
            active={clip.locked}
            onClick={() => updateClip(track, clip.id, { locked: !clip.locked }, true)}
          />
          <IconButton
            icon={clip.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            label={clip.hidden ? "Show" : "Hide"}
            size="sm"
            active={clip.hidden}
            onClick={() => updateClip(track, clip.id, { hidden: !clip.hidden }, true)}
          />
        </div>
      )}
      {/* Left trim handle */}
      {!clip.locked && (
        <span
          onPointerDown={(e) => beginDrag(e, "trim-left")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="group absolute inset-y-0 left-0 flex w-2 cursor-ew-resize touch-none items-center justify-center"
          aria-label="Trim start"
        >
          <span className="h-1/2 w-1 rounded-full bg-white/60 opacity-40 transition-opacity group-hover:opacity-100" />
        </span>
      )}
      {track === "video" ? (
        <span className="pointer-events-none absolute left-1.5 top-1 max-w-[85%] truncate rounded bg-editor-bg/80 px-1.5 py-0.5 text-[9px] font-medium text-white">
          {assetName ?? label}
        </span>
      ) : renaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            else if (e.key === "Escape") setRenaming(false);
          }}
          className="pointer-events-auto absolute left-1.5 z-10 w-[calc(100%-12px)] rounded-editor-sm border border-editor-accent bg-editor-elevated px-1 py-0.5 text-[10px] font-semibold text-editor-text outline-none"
        />
      ) : (
        <span className={`pointer-events-none truncate px-2.5 text-[10px] font-semibold ${colors.text}`}>{label}</span>
      )}
      {/* Right trim handle */}
      {!clip.locked && (
        <span
          onPointerDown={(e) => beginDrag(e, "trim-right")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="group absolute inset-y-0 right-0 flex w-2 cursor-ew-resize touch-none items-center justify-center"
          aria-label="Trim end"
        >
          <span className="h-1/2 w-1 rounded-full bg-white/60 opacity-40 transition-opacity group-hover:opacity-100" />
        </span>
      )}
    </div>
  );
}
