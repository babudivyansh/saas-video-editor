"use client";

// Applies STYLE ONLY (never touches cue text/words) — to the selected caption
// cue if one is selected, or to every cue on the track at once (via
// applyCaptionStyle) if none is selected. Whole-track application is the
// primary CapCut-style UX for a caption template; per-cue override stays
// available at zero extra UI cost when a cue happens to be selected.

import React from "react";
import { useEditorStore } from "../../../store/editorStore";
import { CAPTION_TEMPLATES } from "./captionPresets";

export default function TemplatesGallery() {
  const selection = useEditorStore((s) => s.selection);
  const updateClip = useEditorStore((s) => s.updateClip);
  const applyCaptionStyle = useEditorStore((s) => s.applyCaptionStyle);

  const apply = (styleOnly: (typeof CAPTION_TEMPLATES)[number]["styleOnly"]) => {
    if (selection?.track === "caption") updateClip("caption", selection.clipId, styleOnly, true);
    else applyCaptionStyle(styleOnly);
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      {CAPTION_TEMPLATES.map((tpl) => (
        <button
          key={tpl.label}
          type="button"
          onClick={() => apply(tpl.styleOnly)}
          className="overflow-hidden rounded-editor-md border border-editor-border bg-editor-card p-2.5 text-left transition-colors hover:border-editor-accent cursor-pointer"
        >
          <p className="text-[9px] font-semibold uppercase tracking-wide text-editor-text-faint">{tpl.label}</p>
          <p
            className="mt-1 truncate text-xs"
            style={{
              fontFamily: tpl.styleOnly.fontFamily,
              fontWeight: tpl.styleOnly.bold ? 700 : 400,
              color: tpl.styleOnly.color,
              textTransform: tpl.styleOnly.textTransform,
            }}
          >
            {tpl.preview}
          </p>
        </button>
      ))}
    </div>
  );
}
