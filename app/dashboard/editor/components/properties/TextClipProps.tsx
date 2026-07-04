"use client";

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import type { FontFamily, TextClip } from "@/lib/editor/types";
import { FONT_WHITELIST } from "@/lib/editor/types";
import { ColorField, Field, NumberField, Section, SelectField } from "./fields";

export default function TextClipProps({ clip }: { clip: TextClip }) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const patch = (p: Partial<TextClip>, undoable = true) => updateClip("text", clip.id, p, undoable);

  return (
    <div className="flex flex-col gap-4 p-4">
      <Section title="Text">
        <textarea
          value={clip.text}
          onChange={(e) => patch({ text: e.target.value }, false)}
          onBlur={() => patch({}, true)}
          rows={3}
          className="w-full resize-none rounded-md border border-card-border bg-surface px-2 py-1.5 text-xs text-ink outline-none focus:border-brand"
        />
        <SelectField
          label="Font"
          value={clip.fontFamily}
          options={FONT_WHITELIST}
          onChange={(v) => patch({ fontFamily: v as FontFamily })}
        />
        <NumberField
          label="Size (% height)"
          value={clip.fontSizePct * 100}
          min={1}
          max={50}
          step={0.5}
          onChange={(v) => patch({ fontSizePct: v / 100 })}
        />
        <Field label="Bold">
          <input
            type="checkbox"
            checked={clip.bold}
            onChange={(e) => patch({ bold: e.target.checked })}
            className="h-4 w-4 accent-[#12d6a5]"
          />
        </Field>
        <ColorField label="Color" value={clip.color} onChange={(v) => v && patch({ color: v })} />
        <ColorField label="Background" value={clip.bgColor} allowNone onChange={(v) => patch({ bgColor: v })} />
      </Section>

      <Section title="Timing">
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
      </Section>

      <Section title="Position">
        <NumberField label="X (%)" value={clip.x * 100} min={0} max={100} step={1} onChange={(v) => patch({ x: v / 100 })} />
        <NumberField label="Y (%)" value={clip.y * 100} min={0} max={100} step={1} onChange={(v) => patch({ y: v / 100 })} />
        <p className="text-[10px] leading-snug text-ink-soft">Tip: drag the text directly on the preview.</p>
      </Section>
    </div>
  );
}
