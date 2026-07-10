"use client";

// Bottom timeline dock: toolbar + [frozen track headers | ruler + tracks +
// playhead, scrollable together]. Time↔pixel mapping is linear: x = t * zoom
// (px/second).

import React, { useEffect, useRef, useState } from "react";
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
  const contentWidth = total * zoom + 240; // trailing space to drop clips into

  const seekFromEvent = (e: React.MouseEvent) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    const x = e.clientX - rect.left + scroller.scrollLeft;
    setCurrentTime(Math.max(0, x / zoom));
  };

  return (
    <div className="flex h-60 flex-shrink-0 flex-col border-t border-editor-border bg-editor-panel">
      {/* Toolbar: edit tools left, zoom right */}
      <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-editor-border px-3">
        <EditToolbar />
        <div className="flex items-center gap-2">
          <IconButton icon={<ZoomOut className="h-3.5 w-3.5" />} label="Zoom out" size="sm" onClick={() => setZoom(zoom - 20)} />
          <input
            type="range"
            min={10}
            max={300}
            value={zoom}
            onChange={(e) => setZoom(parseInt(e.target.value))}
            style={sliderTrackStyle(zoom, 10, 300)}
            className={`h-1.5 w-24 cursor-pointer appearance-none rounded-editor-full border border-editor-border outline-none ${SLIDER_THUMB_CLASSES}`}
            aria-label="Timeline zoom"
          />
          <IconButton icon={<ZoomIn className="h-3.5 w-3.5" />} label="Zoom in" size="sm" onClick={() => setZoom(zoom + 20)} />
        </div>
      </div>

      {/* Track area: frozen headers column + scrollable ruler/tracks/playhead */}
      <div className="flex min-h-0 flex-1">
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
            <div onMouseDown={seekFromEvent}>
              <TimeRuler totalSeconds={total} zoom={zoom} />
            </div>
            <div className="flex flex-col gap-1 py-1">
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
  );
}
