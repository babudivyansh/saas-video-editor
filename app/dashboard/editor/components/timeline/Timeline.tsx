"use client";

// Bottom timeline dock: toolbar + [frozen track headers | ruler + tracks +
// playhead, scrollable together]. Time↔pixel mapping is linear: x = t * zoom
// (px/second).

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import { docDuration } from "@/lib/editor/doc-utils";
import { IconButton } from "../ui";
import { SLIDER_THUMB_CLASSES, sliderTrackStyle } from "../ui/sliderStyles";
import TimeRuler from "./TimeRuler";
import TimelineTrack, { TRACK_HEIGHT } from "./TimelineTrack";
import CaptionTrack from "./CaptionTrack";
import TrackHeader from "./TrackHeader";
import Playhead from "./Playhead";
import EditToolbar from "../EditToolbar";
import { useScrub } from "./useScrub";

function fmtLength(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const TRACKS = [
  { kind: "video" as const, label: "Video" },
  { kind: "image" as const, label: "Image" },
  { kind: "text" as const, label: "Text" },
  { kind: "audio" as const, label: "Audio" },
];

export default function Timeline() {
  const doc = useEditorStore((s) => s.doc);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const select = useEditorStore((s) => s.select);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Feeds CaptionTrack's viewport time-range windowing — recomputed on
  // scroll/resize, same ResizeObserver pattern PreviewStage.tsx uses for stageH.
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportWidth(el.clientWidth));
    ro.observe(el);
    setViewportWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const total = Math.max(docDuration(doc), 10);
  const clipCount = doc.tracks.video.length + doc.tracks.text.length + doc.tracks.audio.length + doc.tracks.image.length;
  const contentWidth = total * zoom + 240; // trailing space to drop clips into

  const scrub = useScrub(zoom, scrollRef);

  // Clicking empty lane space moves the playhead there and clears the
  // selection. Clips stop pointer-down propagation, so this only sees presses
  // on the lane background (buttons like the transition chips are skipped).
  const onLanePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, input")) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    setCurrentTime((e.clientX - rect.left + scroller.scrollLeft) / zoom);
    select(null);
  };

  // Zooming keeps the playhead where it is on screen instead of letting the
  // view drift away from it.
  const prevZoom = useRef(zoom);
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const old = prevZoom.current;
    prevZoom.current = zoom;
    if (!scroller || old === zoom) return;
    const t = useEditorStore.getState().currentTime;
    const screenX = t * old - scroller.scrollLeft;
    scroller.scrollLeft = Math.max(0, t * zoom - screenX);
  }, [zoom]);

  // Ctrl/⌘ + wheel (and trackpad pinch, which browsers report as ctrl+wheel)
  // zooms the timeline. Needs a non-passive listener to stop the page zoom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const s = useEditorStore.getState();
      s.setZoom(s.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div className="flex h-44 flex-shrink-0 flex-col border-t md:h-60 border-editor-border bg-editor-panel">
      {/* Toolbar: edit tools left, zoom right */}
      <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-editor-border px-3">
        <EditToolbar />
        {/* On a phone the slider is hidden (−/+ remain): the row was wider
            than the screen and pushed Zoom in off the edge. */}
        <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">
          <span className="mr-2 hidden whitespace-nowrap rounded-editor-full border border-editor-border px-2 py-0.5 font-mono text-[11px] text-editor-text-muted md:inline">
            {clipCount} clip{clipCount === 1 ? "" : "s"} · {fmtLength(docDuration(doc))}
          </span>
          <IconButton icon={<ZoomOut className="h-3.5 w-3.5" />} label="Zoom out" size="sm" onClick={() => setZoom(zoom - 20)} />
          <input
            type="range"
            min={10}
            max={300}
            value={zoom}
            onChange={(e) => setZoom(parseInt(e.target.value))}
            style={sliderTrackStyle(zoom, 10, 300)}
            className={`hidden h-1.5 w-24 cursor-pointer appearance-none sm:block rounded-editor-full border border-editor-border outline-none focus-visible:ring-2 focus-visible:ring-editor-accent focus-visible:ring-offset-1 focus-visible:ring-offset-editor-bg ${SLIDER_THUMB_CLASSES}`}
            aria-label="Timeline zoom"
          />
          <IconButton icon={<ZoomIn className="h-3.5 w-3.5" />} label="Zoom in" size="sm" onClick={() => setZoom(zoom + 20)} />
        </div>
      </div>

      {/* Track area: frozen headers column + scrollable ruler/tracks/playhead.
          Scrolls vertically as a whole when the tracks don't fit (the
          shorter phone timeline), so headers stay level with their lanes. */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
      <div className="flex min-h-full">
        <div className="flex flex-shrink-0 flex-col border-r border-editor-border bg-editor-panel">
          <div className="h-6 w-14 flex-shrink-0" />
          <div className="flex flex-col gap-1 py-1">
            {TRACKS.map((t) => (
              <TrackHeader key={t.kind} kind={t.kind} label={t.label} height={TRACK_HEIGHT[t.kind]} />
            ))}
            <TrackHeader kind="caption" label="Caption" height={TRACK_HEIGHT.caption} />
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
          className="relative flex-1 overflow-x-auto overflow-y-hidden bg-editor-bg"
        >
          <div className="relative" style={{ width: contentWidth, minWidth: "100%" }}>
            <div className="touch-none" {...scrub.handlers}>
              <TimeRuler totalSeconds={total} zoom={zoom} />
            </div>
            <div className="flex flex-col gap-1 py-1" onPointerDown={onLanePointerDown}>
              {TRACKS.map((t) => (
                <TimelineTrack key={t.kind} kind={t.kind} />
              ))}
              <CaptionTrack scrollLeft={scrollLeft} viewportWidth={viewportWidth} />
            </div>
            <Playhead zoom={zoom} scrollRef={scrollRef} />
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
