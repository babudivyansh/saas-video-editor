"use client";

// Center preview: an aspect-ratio stage compositing <video> layers (one per
// unique asset, object-fit: cover — the same math the export's scale+crop
// uses) with absolutely-positioned text overlays. Text is drag-positionable;
// normalized x/y write straight back into the doc, keeping preview and export
// placement identical.

import React, { useEffect, useRef, useState } from "react";
import { useEditorStore } from "../store/editorStore";
import { usePlayback, type MediaRegistry } from "../hooks/usePlayback";
import { docDuration } from "@/lib/editor/doc-utils";
import { ASPECT_DIMENSIONS } from "@/lib/editor/types";
import { useAssets } from "./panels/MediaPanel";
import PreviewControls from "./PreviewControls";
import EditToolbar from "./EditToolbar";

export default function PreviewStage() {
  const doc = useEditorStore((s) => s.doc);
  const currentTime = useEditorStore((s) => s.currentTime);
  const select = useEditorStore((s) => s.select);
  const selection = useEditorStore((s) => s.selection);
  const updateClip = useEditorStore((s) => s.updateClip);
  const commitDrag = useEditorStore((s) => s.commitDrag);

  const { assets: videoAssets } = useAssets("video");
  const { assets: audioAssets } = useAssets("audio");

  const stageRef = useRef<HTMLDivElement>(null);
  const registry = useRef<MediaRegistry>({ videos: new Map(), audios: new Map() });
  usePlayback(registry);

  const [stageH, setStageH] = useState(360);
  const dims = ASPECT_DIMENSIONS[doc.aspect];
  const aspectRatio = dims.w / dims.h;

  // Track rendered stage height so text font sizes (pct of canvas height) scale.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Unique video assets referenced by the timeline (one element per asset).
  const usedVideoAssetIds = [...new Set(doc.tracks.video.map((c) => c.assetId))];
  const usedAudioAssetIds = [...new Set(doc.tracks.audio.map((c) => c.assetId))];
  const assetUrl = (id: string) =>
    videoAssets.find((a) => a.id === id)?.url ?? audioAssets.find((a) => a.id === id)?.url ?? "";

  // Text drag-positioning
  const dragState = useRef<{ clipId: string; before: ReturnType<typeof structuredClone<typeof doc>> } | null>(null);

  const onTextPointerDown = (e: React.PointerEvent, clipId: string) => {
    e.stopPropagation();
    select({ clipId, track: "text" });
    dragState.current = { clipId, before: structuredClone(useEditorStore.getState().doc) };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onTextPointerMove = (e: React.PointerEvent) => {
    const drag = dragState.current;
    const stage = stageRef.current;
    if (!drag || !stage) return;
    const rect = stage.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    updateClip("text", drag.clipId, { x, y }, false);
  };

  const onTextPointerUp = () => {
    if (dragState.current) {
      commitDrag(dragState.current.before);
      dragState.current = null;
    }
  };

  const activeTexts = doc.tracks.text.filter(
    (t) => currentTime >= t.timelineStart && currentTime < t.timelineStart + t.duration,
  );

  const isEmpty = doc.tracks.video.length === 0 && doc.tracks.text.length === 0;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3">
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <div
          ref={stageRef}
          className="relative max-h-full overflow-hidden rounded-xl bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
          style={{ aspectRatio: `${aspectRatio}`, height: "100%", maxWidth: "100%" }}
          onClick={() => select(null)}
        >
          {/* Video layers */}
          {usedVideoAssetIds.map((assetId) => (
            <video
              key={assetId}
              ref={(el) => {
                if (el) registry.current.videos.set(assetId, el);
                else registry.current.videos.delete(assetId);
              }}
              src={assetUrl(assetId)}
              preload="auto"
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
              style={{ opacity: 0 }}
            />
          ))}

          {/* Audio layers (hidden) */}
          {usedAudioAssetIds.map((assetId) => (
            <audio
              key={assetId}
              ref={(el) => {
                if (el) registry.current.audios.set(assetId, el);
                else registry.current.audios.delete(assetId);
              }}
              src={assetUrl(assetId)}
              preload="auto"
            />
          ))}

          {/* Text overlays */}
          {activeTexts.map((t) => (
            <div
              key={t.id}
              onPointerDown={(e) => onTextPointerDown(e, t.id)}
              onPointerMove={onTextPointerMove}
              onPointerUp={onTextPointerUp}
              className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-move select-none whitespace-pre-wrap px-2 py-0.5 ${
                selection?.clipId === t.id ? "ring-2 ring-violet-500" : ""
              }`}
              style={{
                left: `${t.x * 100}%`,
                top: `${t.y * 100}%`,
                fontFamily: t.fontFamily,
                fontWeight: t.bold ? 700 : 400,
                fontSize: `${t.fontSizePct * stageH}px`,
                color: t.color,
                textAlign: t.align,
                backgroundColor: t.bgColor ?? "transparent",
                borderRadius: t.bgColor ? 6 : 0,
                lineHeight: 1.2,
                maxWidth: "90%",
              }}
            >
              {t.text}
            </div>
          ))}

          {isEmpty && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="px-6 text-center text-sm text-white/50">
                Add a video from the Media panel to start editing
              </p>
            </div>
          )}
        </div>
      </div>

      <PreviewControls totalDuration={docDuration(doc)} />
      <EditToolbar />
    </div>
  );
}
