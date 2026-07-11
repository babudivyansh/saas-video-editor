"use client";

// Auto-captioning used to live here (a "generate captions for this clip"
// button) — superseded by the dedicated Caption panel's whole-timeline
// generation flow (see panels/caption/GenerateSection.tsx), which transcribes
// every video clip at once and produces real timeline-synced CaptionClips
// with word-level karaoke data, instead of this clip's one-off plain-text
// TextClips. Removed here rather than left as a second, now-redundant entry point.

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import type { EffectPreset, FilterPreset, TransitionPreset, VideoClip } from "@/lib/editor/types";
import { EFFECT_PRESETS, FILTER_PRESETS, MAX_FADE_SEC, SPEED_OPTIONS, TRANSITION_PRESETS } from "@/lib/editor/types";
import { FieldRow, NumberField, PillGroup, PropertyCard, Slider, Switch } from "../ui";

const PREVIEW_ONLY = (
  <span className="text-[9px] font-normal normal-case tracking-normal text-editor-text-faint">Preview only</span>
);

export default function VideoClipProps({ clip, activeTab }: { clip: VideoClip; activeTab: string }) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const patch = (p: Partial<VideoClip>) => updateClip("video", clip.id, p);

  if (activeTab === "basic") {
    return (
      <div className="flex flex-col gap-3 p-3">
        <PropertyCard title="Video clip" collapsible={false}>
          <NumberField label="Start (s)" value={clip.timelineStart} min={0} step={0.1} onChange={(v) => patch({ timelineStart: v })} />
          <NumberField label="Duration (s)" value={clip.duration} min={0.05} step={0.1} onChange={(v) => patch({ duration: v })} />
          <NumberField label="Trim in (s)" value={clip.srcIn} min={0} step={0.1} onChange={(v) => patch({ srcIn: v })} />
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
    return (
      <div className="flex flex-col gap-3 p-3">
        <PropertyCard title="Effect" trailing={PREVIEW_ONLY}>
          <PillGroup
            layoutId="video-effect"
            value={clip.effect ?? "none"}
            onChange={(key) => patch({ effect: key === "none" ? undefined : (key as EffectPreset) })}
            options={(Object.keys(EFFECT_PRESETS) as EffectPreset[]).map((key) => ({ key, label: EFFECT_PRESETS[key].label }))}
          />
          <p className="text-[10px] leading-snug text-editor-text-faint">Preview only — not yet applied to exports.</p>
        </PropertyCard>
        <PropertyCard title="Transition (out)" trailing={PREVIEW_ONLY}>
          <PillGroup
            layoutId="video-transition"
            value={clip.transitionOut ?? "none"}
            onChange={(key) => patch({ transitionOut: key === "none" ? undefined : (key as TransitionPreset) })}
            options={(Object.keys(TRANSITION_PRESETS) as TransitionPreset[]).map((key) => ({ key, label: TRANSITION_PRESETS[key].label }))}
          />
          <p className="text-[10px] leading-snug text-editor-text-faint">Preview only — not yet applied to exports.</p>
        </PropertyCard>
      </div>
    );
  }

  return null;
}
