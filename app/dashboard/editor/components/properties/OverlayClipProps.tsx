"use client";

// Properties for an overlay (picture-in-picture) video clip — editor Phase 1.
// Placement mirrors image clips (centre x/y + width); everything here is
// exported by filtergraph.ts's overlay block.

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import type { OverlayClip } from "@/lib/editor/types";
import { MAX_FADE_SEC, MAX_OVERLAY_LANES, SPEED_OPTIONS } from "@/lib/editor/types";
import { NumberField, PillGroup, PropertyCard, Slider, Switch } from "../ui";
import { OrientationCard } from "./TransformControls";

export default function OverlayClipProps({ clip, activeTab }: { clip: OverlayClip; activeTab: string }) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const patch = (p: Partial<OverlayClip>) => updateClip("overlay", clip.id, p);

  if (activeTab === "transform") {
    return (
      <div className="flex flex-col gap-3 p-3">
        <PropertyCard title="Position & size" collapsible={false}>
          <Slider label="Size" value={clip.scalePct} min={0.05} max={1.5} step={0.01} onChange={(v) => patch({ scalePct: v })} />
          <Slider label="Left ↔ right" value={clip.x} min={0} max={1} step={0.01} onChange={(v) => patch({ x: v })} />
          <Slider label="Top ↕ bottom" value={clip.y} min={0} max={1} step={0.01} onChange={(v) => patch({ y: v })} />
          <p className="text-[10px] leading-snug text-editor-text-faint">Or drag it on the preview.</p>
        </PropertyCard>
        <OrientationCard value={clip} onChange={(p) => patch(p)} />
      </div>
    );
  }

  if (activeTab === "animation") {
    return (
      <div className="flex flex-col gap-3 p-3">
        <PropertyCard title="Speed">
          <PillGroup
            layoutId="overlay-speed"
            value={clip.speed ?? 1}
            onChange={(s) => patch({ speed: s === 1 ? undefined : s })}
            options={SPEED_OPTIONS.map((s) => ({ key: s, label: `${s}×` }))}
          />
        </PropertyCard>
        <PropertyCard title="Fade">
          <NumberField label="Fade in (s)" value={clip.fadeIn ?? 0} min={0} max={MAX_FADE_SEC} step={0.1} onChange={(v) => patch({ fadeIn: v || undefined })} />
          <NumberField label="Fade out (s)" value={clip.fadeOut ?? 0} min={0} max={MAX_FADE_SEC} step={0.1} onChange={(v) => patch({ fadeOut: v || undefined })} />
        </PropertyCard>
      </div>
    );
  }

  if (activeTab === "audio") {
    return (
      <div className="flex flex-col gap-3 p-3">
        <PropertyCard title="Sound" collapsible={false}>
          <Switch checked={clip.muted} label="Mute this overlay" onChange={(on) => patch({ muted: on })} />
          <Slider label="Volume" value={clip.volume} min={0} max={1} step={0.05} onChange={(v) => patch({ volume: v })} />
        </PropertyCard>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <PropertyCard title="Overlay clip" collapsible={false}>
        <NumberField label="Start (s)" value={clip.timelineStart} min={0} step={0.1} onChange={(v) => patch({ timelineStart: v })} />
        <NumberField label="Duration (s)" value={clip.duration} min={0.05} step={0.1} onChange={(v) => patch({ duration: v })} />
        <NumberField label="Trim in (s)" value={clip.srcIn} min={0} step={0.1} onChange={(v) => patch({ srcIn: v })} />
      </PropertyCard>
      <PropertyCard title="Layer" collapsible={false}>
        <PillGroup
          layoutId="overlay-lane"
          value={clip.lane}
          onChange={(lane) => patch({ lane })}
          options={Array.from({ length: MAX_OVERLAY_LANES }, (_, i) => ({ key: i, label: i === 0 ? "Bottom" : i === MAX_OVERLAY_LANES - 1 ? "Top" : `${i + 1}` }))}
        />
        <p className="text-[10px] leading-snug text-editor-text-faint">Higher layers draw over lower ones.</p>
      </PropertyCard>
    </div>
  );
}
