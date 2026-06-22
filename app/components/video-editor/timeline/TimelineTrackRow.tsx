"use client";

import { useCallback, useRef } from "react";
import { useEditorStore } from "../store/editorStore";
import TimelineClip from "./TimelineClip";
import type { Track } from "@/lib/track-editor-types";

const TRACK_H = 44;

interface Props {
  track: Track;
  zoom: number;
  height: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

export default function TimelineTrackRow({ track, zoom, height, scrollRef }: Props) {
  const addClip = useEditorStore(s => s.addClip);
  const moveClip = useEditorStore(s => s.moveClip);
  const snapEnabled = useEditorStore(s => s.snapEnabled);
  const rowRef = useRef<HTMLDivElement>(null);

  // Handle drop of a media asset dragged from sidebar
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData("application/video-editor-clip");
    if (!data) return;

    const payload = JSON.parse(data) as { url: string; duration: number; kind: string };
    const rect = rowRef.current!.getBoundingClientRect();
    const scrollX = scrollRef.current?.scrollLeft ?? 0;
    const x = e.clientX - rect.left + scrollX;
    let start = Math.max(0, x / zoom);

    // Snap to second boundaries
    if (snapEnabled) start = Math.round(start * 2) / 2;

    if (payload.kind === "video" && track.kind === "video") {
      addClip(track.id, {
        start,
        duration: payload.duration,
        srcIn: 0,
        srcOut: payload.duration,
        data: {
          kind: "video",
          url: payload.url,
          posX: 0.5, posY: 0.5,
          scaleX: 1, scaleY: 1,
          rotation: 0,
          opacity: 1,
          blur: 0,
          speed: 1,
          brightness: 1,
          contrast: 1,
          saturation: 1,
          effects: [],
        },
      });
    } else if (payload.kind === "audio" && track.kind === "audio") {
      addClip(track.id, {
        start,
        duration: payload.duration,
        srcIn: 0,
        srcOut: payload.duration,
        data: {
          kind: "audio",
          url: payload.url,
          volume: 1,
          fadeIn: 0,
          fadeOut: 0,
          muted: false,
        },
      });
    }
  }, [track, zoom, snapEnabled, addClip, scrollRef]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  // Accept clip drops from other rows (for cross-track moves)
  const onClipDrop = useCallback((clipId: string, newStart: number) => {
    moveClip(clipId, newStart, track.id);
  }, [moveClip, track.id]);

  const kindColors: Record<string, { bg: string; border: string }> = {
    video: { bg: "rgba(37,99,235,0.08)", border: "rgba(37,99,235,0.15)" },
    audio: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.15)" },
    text: { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.15)" },
    effect: { bg: "rgba(168,85,247,0.08)", border: "rgba(168,85,247,0.15)" },
  };
  const colors = kindColors[track.kind] ?? { bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.07)" };

  return (
    <div
      ref={rowRef}
      className="relative select-none"
      style={{
        height: TRACK_H,
        background: colors.bg,
        borderBottom: `1px solid ${colors.border}`,
      }}
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      {/* Grid lines every 5s */}
      <GridLines zoom={zoom} />

      {/* Clips */}
      {track.clips.map(clip => (
        <TimelineClip
          key={clip.id}
          clip={clip}
          track={track}
          zoom={zoom}
          height={TRACK_H - 4}
          onMoveDrop={onClipDrop}
          scrollRef={scrollRef}
        />
      ))}
    </div>
  );
}

function GridLines({ zoom }: { zoom: number }) {
  const step = zoom >= 80 ? 1 : 5;
  const count = 120;
  return (
    <>
      {Array.from({ length: count }, (_, i) => (i + 1) * step).map(t => (
        <div
          key={t}
          className="absolute top-0 bottom-0 w-px"
          style={{ left: t * zoom, background: "rgba(255,255,255,0.03)" }}
        />
      ))}
    </>
  );
}
