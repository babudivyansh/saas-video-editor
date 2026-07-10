"use client";

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import type { ImageClip } from "@/lib/editor/types";
import { MAX_FADE_SEC } from "@/lib/editor/types";
import { NumberField, PropertyCard, Slider } from "../ui";

export default function ImageClipProps({ clip, activeTab }: { clip: ImageClip; activeTab: string }) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const patch = (p: Partial<ImageClip>) => updateClip("image", clip.id, p);

  if (activeTab === "transform") {
    return (
      <div className="flex flex-col gap-3 p-3">
        <PropertyCard title="Position & size" collapsible={false}>
          <Slider
            label="Size"
            value={Math.min(clip.scalePct, 3) / 3}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => patch({ scalePct: Math.max(0.02, v * 3) })}
          />
          <Slider label="Opacity" value={clip.opacity} min={0} max={1} step={0.05} onChange={(v) => patch({ opacity: v })} />
          <p className="text-[10px] leading-snug text-editor-text-faint">Drag directly on the preview to reposition.</p>
        </PropertyCard>
      </div>
    );
  }

  if (activeTab === "animation") {
    return (
      <div className="flex flex-col gap-3 p-3">
        <PropertyCard title="Fade" collapsible={false}>
          <NumberField
            label="Fade in (s)"
            value={clip.fadeIn ?? 0}
            min={0}
            max={MAX_FADE_SEC}
            step={0.1}
            onChange={(v) => patch({ fadeIn: v > 0 ? Math.min(v, MAX_FADE_SEC) : undefined })}
          />
          <NumberField
            label="Fade out (s)"
            value={clip.fadeOut ?? 0}
            min={0}
            max={MAX_FADE_SEC}
            step={0.1}
            onChange={(v) => patch({ fadeOut: v > 0 ? Math.min(v, MAX_FADE_SEC) : undefined })}
          />
        </PropertyCard>
      </div>
    );
  }

  // activeTab === "basic"
  return (
    <div className="flex flex-col gap-3 p-3">
      <PropertyCard title="Image / sticker" collapsible={false}>
        <NumberField label="Start (s)" value={clip.timelineStart} min={0} step={0.1} onChange={(v) => patch({ timelineStart: v })} />
        <NumberField label="Duration (s)" value={clip.duration} min={0.05} step={0.1} onChange={(v) => patch({ duration: v })} />
      </PropertyCard>
    </div>
  );
}
