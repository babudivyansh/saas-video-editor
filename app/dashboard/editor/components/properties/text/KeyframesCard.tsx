"use client";

// Keyframes for a text clip: add one at the playhead, then move the text on
// the preview (or edit the numbers) — the clip glides between keyframes.
// Unlike the entrance/loop/exit presets, keyframes are rendered in the export.

import React from "react";
import { Diamond, Plus, Trash2 } from "lucide-react";
import { useEditorStore } from "../../../store/editorStore";
import type { TextClip } from "@/lib/editor/types";
import { removeKeyframe, setKeyframe, stateAt } from "@/lib/editor/keyframes";
import { Button, PropertyCard, Slider } from "../../ui";

export default function KeyframesCard({ clip }: { clip: TextClip }) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const currentTime = useEditorStore((s) => s.currentTime) ?? 0;
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const local = Math.max(0, Math.min(clip.duration, currentTime - clip.timelineStart));
  const kfs = clip.keyframes ?? [];
  const here = kfs.find((k) => Math.abs(k.t - local) <= 1 / 30);
  const now = stateAt(clip, local);
  const inside = currentTime >= clip.timelineStart && currentTime <= clip.timelineStart + clip.duration;

  const setAtPlayhead = (patch: Partial<{ x: number; y: number; scale: number; opacity: number }>) =>
    updateClip("text", clip.id, { keyframes: setKeyframe(clip, local, patch) });

  return (
    <PropertyCard title="Keyframes" collapsible={false}>
      <p className="text-[11px] leading-snug text-editor-text-muted">
        Add a keyframe, move the playhead, then drag the text or change size and opacity — it glides between keyframes in the export too.
      </p>
      {!inside && <p className="text-[11px] text-editor-text-faint">Move the playhead over this clip to add keyframes.</p>}
      <Button variant="subtle" size="sm" className="w-full gap-1.5" disabled={!inside || kfs.length >= 20} onClick={() => setAtPlayhead({})}>
        <Plus className="h-3.5 w-3.5" /> {here ? "Keyframe here" : "Add keyframe at playhead"}
      </Button>

      {kfs.length > 0 && (
        <>
          <ul className="flex flex-col gap-1">
            {kfs.map((k) => {
              const active = here?.t === k.t;
              return (
                <li key={k.t} className={`flex items-center gap-2 rounded-editor-sm border px-2 py-1.5 text-[11.5px] ${active ? "border-editor-accent/60 bg-editor-accent/10" : "border-editor-border bg-editor-card"}`}>
                  <Diamond className={`h-3 w-3 ${active ? "text-editor-accent" : "text-editor-text-faint"}`} aria-hidden="true" />
                  <button type="button" onClick={() => setCurrentTime(clip.timelineStart + k.t)} className="flex-1 text-left text-editor-text hover:underline">
                    {k.t.toFixed(2)} s
                  </button>
                  <span className="text-editor-text-faint">{Math.round(k.scale * 100)}% · {Math.round(k.opacity * 100)}%</span>
                  <button type="button" aria-label={`Remove keyframe at ${k.t.toFixed(2)} s`} onClick={() => updateClip("text", clip.id, { keyframes: removeKeyframe(clip, k.t) })}
                          className="rounded p-0.5 text-editor-text-faint hover:text-red-400">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>
          {inside && (
            <>
              <Slider label="Size at playhead" value={now.scale} min={0.2} max={3} step={0.05} onChange={(v) => setAtPlayhead({ scale: v })} />
              <Slider label="Opacity at playhead" value={now.opacity} min={0} max={1} step={0.05} onChange={(v) => setAtPlayhead({ opacity: v })} />
            </>
          )}
          <button type="button" onClick={() => updateClip("text", clip.id, { keyframes: undefined })} className="self-start text-[11px] text-editor-text-faint hover:text-red-400">
            Remove all keyframes
          </button>
        </>
      )}
    </PropertyCard>
  );
}
