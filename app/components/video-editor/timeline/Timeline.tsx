"use client";

import { useRef, useCallback } from "react";
import { useEditorStore } from "../store/editorStore";
import TimelineControls from "./TimelineControls";
import TimelineRuler from "./TimelineRuler";
import TimelineTrackRow from "./TimelineTrackRow";
import PlayheadMarker from "./PlayheadMarker";

export default function Timeline() {
  const tracks = useEditorStore(s => s.present.tracks);
  const zoom = useEditorStore(s => s.zoom);
  const duration = useEditorStore(s => s.duration);
  const setCurrentTime = useEditorStore(s => s.setCurrentTime);
  const setIsPlaying = useEditorStore(s => s.setIsPlaying);
  const markers = useEditorStore(s => s.present.markers);

  const scrollRef = useRef<HTMLDivElement>(null);
  const TRACK_LABEL_W = 120;
  const RULER_H = 28;
  const TRACK_H = 44;

  const totalW = Math.max(duration * zoom + 200, 800);

  // Click on ruler to seek
  const handleRulerClick = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = Math.max(0, x / zoom);
    setCurrentTime(t);
    setIsPlaying(false);
  }, [zoom, setCurrentTime, setIsPlaying]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Controls bar */}
      <TimelineControls />

      {/* Main scrollable area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Track labels column (fixed, doesn't scroll horizontally) */}
        <div
          className="flex-shrink-0 flex flex-col overflow-y-hidden"
          style={{ width: TRACK_LABEL_W, borderRight: "1px solid #27272a" }}
        >
          {/* Ruler spacer */}
          <div style={{ height: RULER_H, flexShrink: 0, borderBottom: "1px solid #27272a" }} />
          {tracks.map(track => (
            <TrackLabel key={track.id} track={track} height={TRACK_H} />
          ))}
        </div>

        {/* Scrollable clips area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto relative"
        >
          <div style={{ width: totalW, position: "relative" }}>
            {/* Ruler */}
            <div
              onClick={handleRulerClick}
              style={{ height: RULER_H, cursor: "crosshair", position: "sticky", top: 0, zIndex: 10, background: "#111113", borderBottom: "1px solid #27272a" }}
            >
              <TimelineRuler zoom={zoom} duration={duration} markers={markers} />
            </div>

            {/* Playhead */}
            <PlayheadMarker zoom={zoom} rulerHeight={RULER_H} totalHeight={RULER_H + tracks.length * TRACK_H} />

            {/* Track rows */}
            {tracks.map(track => (
              <TimelineTrackRow
                key={track.id}
                track={track}
                zoom={zoom}
                height={TRACK_H}
                scrollRef={scrollRef}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Add track row — full width so buttons never get clipped */}
      <div
        className="flex-shrink-0 flex items-center"
        style={{ height: 32, borderTop: "1px solid #1a1a1e", background: "#111113" }}
      >
        <AddTrackButton />
      </div>
    </div>
  );
}

function TrackLabel({ track, height }: { track: { id: string; name: string; kind: string; locked: boolean; hidden: boolean; muted: boolean }; height: number }) {
  const updateTrack = useEditorStore(s => s.updateTrack);
  const removeTrack = useEditorStore(s => s.removeTrack);

  const kindColors: Record<string, string> = {
    video: "#3b82f6",
    audio: "#22c55e",
    text: "#f59e0b",
    effect: "#a855f7",
  };

  return (
    <div
      className="relative flex items-center gap-1.5 px-2 flex-shrink-0 group"
      style={{
        height,
        borderBottom: "1px solid #1a1a1e",
        background: "#111113",
      }}
    >
      <div
        className="w-1 rounded-full flex-shrink-0"
        style={{ height: 20, background: kindColors[track.kind] ?? "#52525b" }}
      />
      <span className="text-xs font-medium truncate flex-1 pr-1" style={{ color: "#a1a1aa" }}>
        {track.name}
      </span>
      {/* Buttons float absolutely so they don't shrink the track name */}
      <div className="absolute right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "#111113" }}>
        {/* Mute */}
        <IconBtn
          active={track.muted}
          title={track.muted ? "Unmute" : "Mute"}
          onClick={() => updateTrack(track.id, { muted: !track.muted })}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
            {track.muted ? (
              <>
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" strokeLinecap="round" />
                <line x1="17" y1="9" x2="23" y2="15" strokeLinecap="round" />
              </>
            ) : (
              <>
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 010 7.07" strokeLinecap="round" />
              </>
            )}
          </svg>
        </IconBtn>
        {/* Hide */}
        <IconBtn
          active={track.hidden}
          title={track.hidden ? "Show" : "Hide"}
          onClick={() => updateTrack(track.id, { hidden: !track.hidden })}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
            {track.hidden ? (
              <>
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" strokeLinecap="round" />
                <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" strokeLinecap="round" />
                <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" />
              </>
            ) : (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
        </IconBtn>
        {/* Delete */}
        <IconBtn title="Delete track" onClick={() => removeTrack(track.id)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
            <polyline points="3 6 5 6 21 6" strokeLinecap="round" />
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" strokeLinecap="round" />
            <path d="M10 11v6M14 11v6" strokeLinecap="round" />
          </svg>
        </IconBtn>
      </div>
    </div>
  );
}

function AddTrackButton() {
  const addTrack = useEditorStore(s => s.addTrack);
  return (
    <div className="flex items-center gap-1 px-2 py-1.5">
      <button
        onClick={() => addTrack("video")}
        className="flex items-center gap-1 text-xs transition-colors"
        style={{ color: "#3b82f6" }}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#60a5fa")}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#3b82f6")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" strokeLinecap="round" />
          <line x1="8" y1="12" x2="16" y2="12" strokeLinecap="round" />
        </svg>
        Add Video
      </button>
      <span style={{ color: "#27272a" }}>·</span>
      <button
        onClick={() => addTrack("audio")}
        className="flex items-center gap-1 text-xs transition-colors"
        style={{ color: "#22c55e" }}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#4ade80")}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#22c55e")}
      >
        + Audio
      </button>
      <span style={{ color: "#27272a" }}>·</span>
      <button
        onClick={() => addTrack("text")}
        className="flex items-center gap-1 text-xs transition-colors"
        style={{ color: "#f59e0b" }}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#fbbf24")}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#f59e0b")}
      >
        + Text
      </button>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-5 h-5 flex items-center justify-center rounded"
      style={{ color: active ? "#ef4444" : "#52525b" }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#e4e4e7")}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = active ? "#ef4444" : "#52525b")}
    >
      {children}
    </button>
  );
}
