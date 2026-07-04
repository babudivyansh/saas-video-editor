"use client";

import React, { useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useEditorStore } from "../../store/editorStore";
import type { FilterPreset, TextClip, VideoClip } from "@/lib/editor/types";
import { FILTER_PRESETS, MAX_FADE_SEC, SPEED_OPTIONS } from "@/lib/editor/types";
import { Field, NumberField, Section, SliderField } from "./fields";

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

export default function VideoClipProps({ clip }: { clip: VideoClip }) {
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

  return (
    <div className="flex flex-col gap-4 p-4">
      <Section title="Captions">
        <button
          onClick={generateCaptions}
          disabled={captionState === "working"}
          className="w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-violet-500 disabled:opacity-50 cursor-pointer"
        >
          {captionState === "working" ? "Transcribing…" : "Auto captions (1 credit)"}
        </button>
        {captionState === "error" && captionError && (
          <p className="text-[10px] leading-snug text-red-400">{captionError}</p>
        )}
        <p className="text-[10px] leading-snug text-zinc-500">
          Transcribes this clip's speech and adds caption text to the timeline, aligned word-by-word.
        </p>
      </Section>

      <Section title="Video clip">
        <NumberField
          label="Start (s)"
          value={clip.timelineStart}
          min={0}
          step={0.1}
          onChange={(v) => patch({ timelineStart: v })}
        />
        <NumberField
          label="Duration (s)"
          value={clip.duration}
          min={0.05}
          step={0.1}
          onChange={(v) => patch({ duration: v })}
        />
        <NumberField
          label="Trim in (s)"
          value={clip.srcIn}
          min={0}
          step={0.1}
          onChange={(v) => patch({ srcIn: v })}
        />
      </Section>

      <Section title="Speed">
        <div className="flex flex-wrap gap-1">
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => patch({ speed: s === 1 ? undefined : s })}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                (clip.speed ?? 1) === s ? "bg-violet-600/15 text-violet-400" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
      </Section>

      <Section title="Fade">
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
      </Section>

      <Section title="Filter">
        <div className="flex flex-wrap gap-1">
          {(Object.keys(FILTER_PRESETS) as FilterPreset[]).map((key) => (
            <button
              key={key}
              onClick={() => patch({ filter: key === "none" ? undefined : key })}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                (clip.filter ?? "none") === key ? "bg-violet-600/15 text-violet-400" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              {FILTER_PRESETS[key].label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Audio">
        <SliderField
          label="Volume"
          value={clip.volume}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => patch({ volume: v })}
        />
        <Field label="Mute">
          <input
            type="checkbox"
            checked={clip.muted}
            onChange={(e) => patch({ muted: e.target.checked })}
            className="h-4 w-4 accent-violet-500"
          />
        </Field>
      </Section>
    </div>
  );
}
