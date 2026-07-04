"use client";

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import type { VideoClip } from "@/lib/editor/types";
import { Field, NumberField, Section, SliderField } from "./fields";

export default function VideoClipProps({ clip }: { clip: VideoClip }) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const patch = (p: Partial<VideoClip>) => updateClip("video", clip.id, p);

  return (
    <div className="flex flex-col gap-4 p-4">
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
            className="h-4 w-4 accent-[--brand]"
          />
        </Field>
      </Section>
    </div>
  );
}
