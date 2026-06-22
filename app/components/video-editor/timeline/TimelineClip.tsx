"use client";

import { useRef, useCallback } from "react";
import { useEditorStore } from "../store/editorStore";
import type { Clip, Track, VideoClipData, TextClipData } from "@/lib/track-editor-types";

interface Props {
  clip: Clip;
  track: Track;
  zoom: number;
  height: number;
  onMoveDrop: (clipId: string, newStart: number) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

const HANDLE_W = 6;

export default function TimelineClip({ clip, track, zoom, height, onMoveDrop, scrollRef }: Props) {
  const selectedClipId = useEditorStore(s => s.selectedClipId);
  const selectClip = useEditorStore(s => s.selectClip);
  const moveClip = useEditorStore(s => s.moveClip);
  const resizeClipLeft = useEditorStore(s => s.resizeClipLeft);
  const resizeClipRight = useEditorStore(s => s.resizeClipRight);
  const removeClip = useEditorStore(s => s.removeClip);
  const splitClipAtTime = useEditorStore(s => s.splitClipAtTime);
  const currentTime = useEditorStore(s => s.currentTime);
  const snapEnabled = useEditorStore(s => s.snapEnabled);

  const isSelected = selectedClipId === clip.id;
  const left = clip.start * zoom;
  const width = Math.max(clip.duration * zoom, HANDLE_W * 2 + 4);

  // Drag state refs (avoid React re-renders during drag)
  const dragState = useRef<{ type: "move" | "left" | "right"; startX: number; startVal: number } | null>(null);

  const snapTo = useCallback((t: number) => {
    if (!snapEnabled) return t;
    const rounded = Math.round(t * 2) / 2; // snap to 0.5s
    return Math.abs(rounded - t) < 0.25 ? rounded : t;
  }, [snapEnabled]);

  const onPointerDown = useCallback((e: React.PointerEvent, type: "move" | "left" | "right") => {
    e.stopPropagation();
    selectClip(clip.id);
    dragState.current = { type, startX: e.clientX, startVal: type === "move" ? clip.start : clip.duration };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }, [clip.id, clip.start, clip.duration, selectClip]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    const delta = (e.clientX - dragState.current.startX) / zoom;

    if (dragState.current.type === "move") {
      const newStart = snapTo(Math.max(0, dragState.current.startVal + delta));
      moveClip(clip.id, newStart);
    } else if (dragState.current.type === "left") {
      resizeClipLeft(clip.id, delta);
      dragState.current.startX = e.clientX;
    } else if (dragState.current.type === "right") {
      const newDur = Math.max(0.1, dragState.current.startVal + delta);
      resizeClipRight(clip.id, newDur);
    }
  }, [clip.id, zoom, snapTo, moveClip, resizeClipLeft, resizeClipRight]);

  const onPointerUp = useCallback(() => {
    dragState.current = null;
  }, []);

  // Double-click to split at playhead
  const onDblClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    splitClipAtTime(clip.id, currentTime);
  }, [clip.id, currentTime, splitClipAtTime]);

  // Right-click context menu (simple)
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Show a simple inline action — will use a proper context menu in future
    if (window.confirm(`Delete clip "${getClipLabel(clip)}"?`)) {
      removeClip(clip.id);
    }
  }, [clip, removeClip]);

  const kindColors: Record<string, { bg: string; border: string; label: string }> = {
    video: { bg: "#1e3a5f", border: "#2563eb", label: "#93c5fd" },
    audio: { bg: "#14532d", border: "#16a34a", label: "#86efac" },
    text:  { bg: "#451a03", border: "#d97706", label: "#fcd34d" },
    effect: { bg: "#2e1065", border: "#7c3aed", label: "#c4b5fd" },
    transition: { bg: "#1f2937", border: "#4b5563", label: "#9ca3af" },
  };
  const color = kindColors[clip.data.kind] ?? kindColors.effect;

  return (
    <div
      className="absolute top-0.5 rounded-sm overflow-hidden select-none"
      style={{
        left,
        width,
        height,
        background: color.bg,
        border: `1px solid ${isSelected ? "#60a5fa" : color.border}`,
        boxShadow: isSelected ? "0 0 0 2px rgba(96,165,250,0.3)" : undefined,
        cursor: "grab",
        zIndex: isSelected ? 10 : 1,
        transition: "box-shadow 0.1s",
      }}
      onPointerDown={e => onPointerDown(e, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDblClick}
      onContextMenu={onContextMenu}
      onClick={e => { e.stopPropagation(); selectClip(clip.id); }}
    >
      {/* Left resize handle */}
      <div
        className="absolute top-0 left-0 bottom-0 flex items-center justify-center cursor-ew-resize"
        style={{ width: HANDLE_W, background: `${color.border}66`, zIndex: 5 }}
        onPointerDown={e => { e.stopPropagation(); onPointerDown(e, "left"); }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="w-px h-3 rounded-full" style={{ background: color.border }} />
      </div>

      {/* Clip label */}
      <div
        className="absolute inset-0 flex items-center px-2 overflow-hidden pointer-events-none"
        style={{ paddingLeft: HANDLE_W + 4 }}
      >
        <span
          className="text-xs font-medium truncate"
          style={{ color: color.label, fontSize: 10 }}
        >
          {getClipLabel(clip)}
        </span>
      </div>

      {/* Waveform / thumbnail placeholder for audio clips */}
      {clip.data.kind === "audio" && (
        <div className="absolute inset-0 flex items-center overflow-hidden pointer-events-none px-2" style={{ opacity: 0.3 }}>
          <WaveformPlaceholder />
        </div>
      )}

      {/* Right resize handle */}
      <div
        className="absolute top-0 right-0 bottom-0 flex items-center justify-center cursor-ew-resize"
        style={{ width: HANDLE_W, background: `${color.border}66`, zIndex: 5 }}
        onPointerDown={e => { e.stopPropagation(); onPointerDown(e, "right"); }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="w-px h-3 rounded-full" style={{ background: color.border }} />
      </div>
    </div>
  );
}

function getClipLabel(clip: Clip): string {
  switch (clip.data.kind) {
    case "video": return "Video";
    case "audio": return "Audio";
    case "text": return (clip.data as TextClipData).text.slice(0, 20) || "Text";
    case "effect": return `Effect`;
    case "transition": return "Transition";
    default: return "Clip";
  }
}

function WaveformPlaceholder() {
  const bars = Array.from({ length: 40 }, (_, i) => {
    const h = 20 + Math.sin(i * 0.7) * 15 + Math.cos(i * 1.3) * 10;
    return Math.max(4, Math.min(36, h));
  });
  return (
    <div className="flex items-center gap-px h-full">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-px flex-shrink-0 rounded-full"
          style={{ height: `${h}%`, background: "#22c55e" }}
        />
      ))}
    </div>
  );
}
