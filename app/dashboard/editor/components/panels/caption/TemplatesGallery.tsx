"use client";

// Caption templates in the editor: the same templates as AutoClip, drawn by
// the same preview and burned by the same engine on export. Applies to the
// selected cue if one is selected, otherwise to every cue on the track (the
// CapCut-style default). "Plain captions" goes back to per-cue styling.

import React from "react";
import { useEditorStore } from "../../../store/editorStore";
import CaptionTemplateGallery from "@/app/components/captions/CaptionTemplateGallery";
import { useUpgradePrompt } from "@/app/components/captions/useUpgradePrompt";
import { showPanelToast } from "../../ui";
import { playUiSound } from "../../../hooks/useUiSound";

export default function TemplatesGallery() {
  const selection = useEditorStore((s) => s.selection);
  const captions = useEditorStore((s) => s.doc.tracks.caption);
  const updateClip = useEditorStore((s) => s.updateClip);
  const applyCaptionStyle = useEditorStore((s) => s.applyCaptionStyle);
  const upgrade = useUpgradePrompt();

  const selected = selection?.track === "caption" ? captions.find((c) => c.id === selection.clipId) : undefined;
  const current = selected?.templateId ?? (captions.length && captions.every((c) => c.templateId === captions[0].templateId) ? captions[0].templateId : undefined);

  const apply = (templateId: string | undefined) => {
    const patch = { templateId };
    if (selected) updateClip("caption", selected.id, patch, true);
    else applyCaptionStyle(patch);
    playUiSound("pick");
    if (captions.length > 0) showPanelToast(`${templateId ? "Style" : "Plain captions"} applied to ${selected ? "this cue" : `all ${captions.length} cues`}`);
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => apply(undefined)}
        className={`editor-press w-full rounded-editor-md border px-2.5 py-2 text-left text-xs transition-colors ${
          current ? "border-editor-border text-editor-text-faint hover:border-editor-accent" : "border-editor-accent text-editor-text"
        }`}
      >
        Plain captions (style each cue yourself)
      </button>
      <CaptionTemplateGallery value={current ?? null} onChange={apply} onLocked={upgrade} columns={3} maxHeightClass="max-h-[520px]" />
    </div>
  );
}
