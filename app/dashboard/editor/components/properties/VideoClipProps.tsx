"use client";

import React, { useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useEditorStore } from "../../store/editorStore";
import type { EffectPreset, FilterPreset, TextClip, TransitionPreset, VideoClip } from "@/lib/editor/types";
import { EFFECT_PRESETS, FILTER_PRESETS, MAX_FADE_SEC, SPEED_OPTIONS, TRANSITION_PRESETS } from "@/lib/editor/types";
import { Button, FieldRow, NumberField, PillGroup, PropertyCard, Slider, Switch } from "../ui";

const CAPTION_WORDS_PER_LINE = 4;

// Convert word timings (source-time seconds) into caption text clips aligned
// to where this video clip sits on the timeline, honoring its trim and speed.
function wordsToCaptionClips(
  words: { word: string; start: number; end: number }[],
  clip: VideoClip,
): TextClip[] {
  const speed = clip.speed ?? 1;
  const srcOut = clip.srcIn + clip.duration * speed;
  const inWindow = words.filter((w) => w.end > clip.srcIn && w.start < srcOut);
  const clips: TextClip[] = [];

  for (let i = 0; i < inWindow.length; i += CAPTION_WORDS_PER_LINE) {
    const group = inWindow.slice(i, i + CAPTION_WORDS_PER_LINE);
    const srcStart = Math.max(group[0].start, clip.srcIn);
    const srcEnd = Math.min(group[group.length - 1].end, srcOut);
    const timelineStart = clip.timelineStart + (srcStart - clip.srcIn) / speed;
    const duration = Math.max((srcEnd - srcStart) / speed, 0.2);
    clips.push({
      type: "text",
      id: crypto.randomUUID(),
      timelineStart,
      duration,
      text: group.map((w) => w.word).join(" "),
      fontFamily: "Arial",
      fontSizePct: 0.04,
      color: "#ffffff",
      bold: true,
      align: "center",
      x: 0.5,
      y: 0.85,
      bgColor: "#000000",
    });
  }
  return clips;
}

const PREVIEW_ONLY = (
  <span className="text-[9px] font-normal normal-case tracking-normal text-editor-text-faint">Preview only</span>
);

export default function VideoClipProps({ clip, activeTab }: { clip: VideoClip; activeTab: string }) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const addTextClips = useEditorStore((s) => s.addTextClips);
  const { user, refreshUser } = useAuth();
  const [captionState, setCaptionState] = useState<"idle" | "working" | "error">("idle");
  const [captionError, setCaptionError] = useState<string | null>(null);
  const patch = (p: Partial<VideoClip>) => updateClip("video", clip.id, p);

  const generateCaptions = async () => {
    if ((user?.credits ?? 0) < 1) {
      setCaptionError("Not enough credits (1 needed).");
      setCaptionState("error");
      return;
    }
    setCaptionState("working");
    setCaptionError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/editor/captions", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: clip.assetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Transcription failed");
      const captions = wordsToCaptionClips(data.words, clip);
      if (captions.length === 0) throw new Error("No speech found inside this clip's trim range");
      addTextClips(captions);
      setCaptionState("idle");
      refreshUser();
    } catch (e) {
      setCaptionError(e instanceof Error ? e.message : "Transcription failed");
      setCaptionState("error");
      refreshUser();
    }
  };

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

  // activeTab === "ai"
  return (
    <div className="flex flex-col gap-3 p-3">
      <PropertyCard title="Captions" collapsible={false}>
        <Button variant="primary" onClick={generateCaptions} disabled={captionState === "working"} className="w-full">
          {captionState === "working" ? "Transcribing…" : "Auto captions (1 credit)"}
        </Button>
        {captionState === "error" && captionError && <p className="text-[10px] leading-snug text-red-400">{captionError}</p>}
        <p className="text-[10px] leading-snug text-editor-text-faint">
          Transcribes this clip&apos;s speech and adds caption text to the timeline, aligned word-by-word.
        </p>
      </PropertyCard>
    </div>
  );
}
