"use client";

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import type { AudioClip } from "@/lib/editor/types";
import { NumberField, Section, SliderField } from "./fields";

export default function AudioClipProps({ clip }: { clip: AudioClip }) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const patch = (p: Partial<AudioClip>) => updateClip("audio", clip.id, p);

  return (
    <div className="flex flex-col gap-4 p-4">
      <Section title="Audio clip">
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
        <SliderField
          label="Volume"
          value={clip.volume}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => patch({ volume: v })}
        />
      </Section>
    </div>
  );
}
