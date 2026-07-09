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

export default function PreviewStage() {
  const doc = useEditorStore((s) => s.doc);
  const currentTime = useEditorStore((s) => s.currentTime);
  const select = useEditorStore((s) => s.select);
  const selection = useEditorStore((s) => s.selection);
  const updateClip = useEditorStore((s) => s.updateClip);
  const commitDrag = useEditorStore((s) => s.commitDrag);

  const { assets: videoAssets } = useAssets("video");
  const { assets: audioAssets } = useAssets("audio");
  const { assets: imageAssets } = useAssets("image");

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
    videoAssets.find((a) => a.id === id)?.url ??
    audioAssets.find((a) => a.id === id)?.url ??
    imageAssets.find((a) => a.id === id)?.url ??
    "";

  // Text/image drag-positioning (shared — both are normalized x/y overlays)
  const dragState = useRef<{ clipId: string; track: "text" | "image"; before: ReturnType<typeof structuredClone<typeof doc>> } | null>(null);

  const onOverlayPointerDown = (e: React.PointerEvent, clipId: string, track: "text" | "image") => {
    e.stopPropagation();
    select({ clipId, track });
    dragState.current = { clipId, track, before: structuredClone(useEditorStore.getState().doc) };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onOverlayPointerMove = (e: React.PointerEvent) => {
    const drag = dragState.current;
    const stage = stageRef.current;
    if (!drag || !stage) return;
    const rect = stage.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    updateClip(drag.track, drag.clipId, { x, y }, false);
  };

  const onOverlayPointerUp = () => {
    if (dragState.current) {
      commitDrag(dragState.current.before);
      dragState.current = null;
    }
  };

  const activeTexts = doc.tracks.text.filter(
    (t) => currentTime >= t.timelineStart && currentTime < t.timelineStart + t.duration,
  );
  const activeImages = doc.tracks.image.filter(
    (im) => currentTime >= im.timelineStart && currentTime < im.timelineStart + im.duration,
  );

  const isEmpty = doc.tracks.video.length === 0 && doc.tracks.text.length === 0 && doc.tracks.image.length === 0;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3">
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <div
          ref={stageRef}
          className="relative max-h-full overflow-hidden rounded-xl bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
          style={{ aspectRatio: `${aspectRatio}`, height: "100%", maxWidth: "100%" }}
          onClick={() => select(null)}
        >
          {/* Video layers — skip mounting until the asset library cache has
              resolved a URL for it (e.g. right after MediaPanel.tsx's
              useAssets() cache fetch is still in flight, or a freshly-created
              asset hasn't been registered into it yet). Rendering <video
              src=""> in that gap is exactly what triggers React's own "pass
              null instead of an empty string" warning, and briefly points
              the element at nothing. */}
          {usedVideoAssetIds.filter((id) => assetUrl(id)).map((assetId) => (
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

          {/* Audio layers (hidden) — same not-yet-resolved guard as above. */}
          {usedAudioAssetIds.filter((id) => assetUrl(id)).map((assetId) => (
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

          {/* Image/sticker overlays — same not-yet-resolved guard as the video/audio layers above. */}
          {activeImages.filter((im) => assetUrl(im.assetId)).map((im) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={im.id}
              src={assetUrl(im.assetId)}
              alt=""
              onPointerDown={(e) => onOverlayPointerDown(e, im.id, "image")}
              onPointerMove={onOverlayPointerMove}
              onPointerUp={onOverlayPointerUp}
              className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-move select-none ${
                selection?.clipId === im.id ? "ring-2 ring-violet-500" : ""
              }`}
              style={{
                left: `${im.x * 100}%`,
                top: `${im.y * 100}%`,
                width: `${im.scalePct * 100}%`,
                opacity: im.opacity,
              }}
            />
          ))}

          {/* Text overlays */}
          {activeTexts.map((t) => (
            <div
              key={t.id}
              onPointerDown={(e) => onOverlayPointerDown(e, t.id, "text")}
              onPointerMove={onOverlayPointerMove}
              onPointerUp={onOverlayPointerUp}
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
    </div>
  );
}
