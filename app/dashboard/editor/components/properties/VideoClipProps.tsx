"use client";

// Auto-captioning used to live here (a "generate captions for this clip"
// button) — superseded by the dedicated Caption panel's whole-timeline
// generation flow (see panels/caption/GenerateSection.tsx), which transcribes
// every video clip at once and produces real timeline-synced CaptionClips
// with word-level karaoke data, instead of this clip's one-off plain-text
// TextClips. Removed here rather than left as a second, now-redundant entry point.

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import type { EffectPreset, FilterPreset, TransitionPreset, VideoAdjust, VideoClip } from "@/lib/editor/types";
import { EFFECT_PRESETS, FILTER_PRESETS, MAX_FADE_SEC, NEUTRAL_ADJUST, SPEED_OPTIONS, TRANSITION_PRESETS } from "@/lib/editor/types";
import { Button, FieldRow, NumberField, PillGroup, PropertyCard, Slider, Switch } from "../ui";
import { isNeutral, withAdjust } from "@/lib/editor/video-look";
import MatchColoursCard from "./MatchColoursCard";

export default function VideoClipProps({ clip, activeTab }: { clip: VideoClip; activeTab: string }) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const patch = (p: Partial<VideoClip>) => updateClip("video", clip.id, p);
  const applyLookToAll = useEditorStore((s) => s.applyVideoLookToAll);

  if (activeTab === "basic") {
    return (
      <div className="flex flex-col gap-3 p-3">
        <PropertyCard title="Video clip" collapsible={false}>
          <NumberField label="Start (s)" value={clip.timelineStart} min={0} step={0.1} onChange={(v) => patch({ timelineStart: v })} />
          <NumberField label="Duration (s)" value={clip.duration} min={0.05} step={0.1} onChange={(v) => patch({ duration: v })} />
          <NumberField label="Trim in (s)" value={clip.srcIn} min={0} step={0.1} onChange={(v) => patch({ srcIn: v })} />
        </PropertyCard>
        <PropertyCard title="Framing" collapsible={false}>
          <PillGroup
            layoutId="video-fit"
            value={clip.fit ?? "fill"}
            onChange={(key) => patch({ fit: key === "fit" ? "fit" : undefined })}
            options={[
              { key: "fill", label: "Fill (crop)" },
              { key: "fit", label: "Fit (blur)" },
            ]}
          />
          {(clip.fit ?? "fill") === "fill" && (
            <>
              <Slider label="Left ↔ right" value={clip.focusX ?? 0.5} min={0} max={1} step={0.01} onChange={(v) => patch({ focusX: v === 0.5 ? undefined : v })} />
              <Slider label="Top ↕ bottom" value={clip.focusY ?? 0.5} min={0} max={1} step={0.01} onChange={(v) => patch({ focusY: v === 0.5 ? undefined : v })} />
            </>
          )}
        </PropertyCard>
      </div>
    );
  }

  if (activeTab === "animation") {
    return (
      <div className="flex flex-col gap-3 p-3">
        <PropertyCard title="Speed">
          <PillGroup
            layoutId="video-speed"
            value={clip.speed ?? 1}
            onChange={(s) => patch({ speed: s === 1 ? undefined : s })}
            options={SPEED_OPTIONS.map((s) => ({ key: s, label: `${s}×` }))}
          />
        </PropertyCard>
        <PropertyCard title="Fade">
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

  if (activeTab === "adjust") {
    const adj = clip.adjust ?? NEUTRAL_ADJUST;
    const setAdj = (p: Partial<VideoAdjust>) => {
      const next = withAdjust(clip.adjust, p);
      patch({ adjust: isNeutral(next) ? undefined : next });
    };
    return (
      <div className="flex flex-col gap-3 p-3">
        <PropertyCard title="Filter" collapsible={false}>
          <PillGroup
            layoutId="video-filter"
            value={clip.filter ?? "none"}
            onChange={(key) => patch({ filter: key === "none" ? undefined : (key as FilterPreset) })}
            options={(Object.keys(FILTER_PRESETS) as FilterPreset[]).map((key) => ({ key, label: FILTER_PRESETS[key].label }))}
          />
        </PropertyCard>
        <PropertyCard title="Fine-tune" collapsible={false}>
          <Slider label="Brightness" value={adj.brightness} min={-0.3} max={0.3} step={0.01} onChange={(v) => setAdj({ brightness: v })} />
          <Slider label="Contrast" value={adj.contrast} min={0.5} max={1.5} step={0.01} onChange={(v) => setAdj({ contrast: v })} />
          <Slider label="Saturation" value={adj.saturation} min={0} max={2} step={0.01} onChange={(v) => setAdj({ saturation: v })} />
          <Slider label="Warmth" value={adj.warmth} min={-1} max={1} step={0.05} onChange={(v) => setAdj({ warmth: v })} />
          <div className="flex gap-1.5">
            <Button variant="subtle" size="sm" className="flex-1" disabled={isNeutral(clip.adjust)} onClick={() => patch({ adjust: undefined })}>Reset</Button>
            <Button variant="subtle" size="sm" className="flex-1" onClick={() => applyLookToAll({ filter: clip.filter, adjust: clip.adjust })}>Use on all video clips</Button>
          </div>
        </PropertyCard>
        <MatchColoursCard clip={clip} />
      </div>
    );
  }

  if (activeTab === "audio") {
    return (
      <div className="flex flex-col gap-3 p-3">
        <PropertyCard title="Audio" collapsible={false}>
          <Slider label="Volume" value={clip.volume} min={0} max={1} step={0.05} onChange={(v) => patch({ volume: v })} />
          <FieldRow label="Mute">
            <Switch checked={clip.muted} onChange={(v) => patch({ muted: v })} />
          </FieldRow>
        </PropertyCard>
      </div>
    );
  }

  if (activeTab === "effects") {
    const part = clip.effectStart !== undefined || clip.effectEnd !== undefined;
    return (
      <div className="flex flex-col gap-3 p-3">
        <PropertyCard title="Effect">
          <PillGroup
            layoutId="video-effect"
            value={clip.effect ?? "none"}
            onChange={(key) => patch({ effect: key === "none" ? undefined : (key as EffectPreset) })}
            options={(Object.keys(EFFECT_PRESETS) as EffectPreset[]).map((key) => ({ key, label: EFFECT_PRESETS[key].label }))}
          />
          {clip.effect && clip.effect !== "none" && (
            <>
              <Slider label="Strength" value={clip.effectStrength ?? 1} min={0.1} max={1} step={0.05} onChange={(v) => patch({ effectStrength: v >= 1 ? undefined : v })} />
              <PillGroup
                layoutId="video-effect-where"
                value={part ? "part" : "whole"}
                onChange={(k) => patch(k === "whole" ? { effectStart: undefined, effectEnd: undefined } : { effectStart: 0, effectEnd: Math.min(clip.duration, 2) })}
                options={[{ key: "whole", label: "Whole clip" }, { key: "part", label: "Part of it" }]}
              />
              {part && (
                <>
                  <NumberField label="From (s)" value={clip.effectStart ?? 0} min={0} max={clip.duration} step={0.1}
                    onChange={(v) => patch({ effectStart: Math.min(v, (clip.effectEnd ?? clip.duration) - 0.1) })} />
                  <NumberField label="To (s)" value={clip.effectEnd ?? clip.duration} min={0} max={clip.duration} step={0.1}
                    onChange={(v) => patch({ effectEnd: Math.max(v, (clip.effectStart ?? 0) + 0.1) })} />
                </>
              )}
            </>
          )}
          <p className="text-[10px] leading-snug text-editor-text-faint">Applied in the export. The preview shows an approximation; strength shows only in the export.</p>
        </PropertyCard>
        <PropertyCard title="Transition (out)">
          <PillGroup
            layoutId="video-transition"
            value={clip.transitionOut ?? "none"}
            onChange={(key) => patch({ transitionOut: key === "none" ? undefined : (key as TransitionPreset) })}
            options={(Object.keys(TRANSITION_PRESETS) as TransitionPreset[]).map((key) => ({ key, label: TRANSITION_PRESETS[key].label }))}
          />
          <p className="text-[10px] leading-snug text-editor-text-faint">Applied in the export. The preview shows every transition as a fade.</p>
        </PropertyCard>
      </div>
    );
  }

  return null;
}
