"use client";

// Text style templates. With a text clip selected, a template restyles it —
// STYLE ONLY, never its text/richText (see TEXT_TEMPLATES in textPresets.ts).
// With nothing selected, it adds a new text clip in that style instead of
// sitting there disabled.

import React from "react";
import { useEditorStore } from "../../../store/editorStore";
import { TEXT_TEMPLATES } from "./textPresets";
import { addTextAtPlayhead } from "./AddTextSection";
import { showPanelToast } from "../../ui";
import { playUiSound } from "../../../hooks/useUiSound";

export default function TemplatesGallery() {
  const selection = useEditorStore((s) => s.selection);
  const updateClip = useEditorStore((s) => s.updateClip);
  const clipId = selection?.track === "text" ? selection.clipId : null;

  return (
    <div className="flex flex-col gap-2">
      <p className="px-0.5 text-[11.5px] text-editor-text-muted">
        {clipId ? "Click a style to restyle the selected text — your words stay." : "Click a style to add it at the playhead. Select a text layer first to restyle it instead."}
      </p>
      <div className="editor-stagger-grid grid grid-cols-2 gap-2">
        {TEXT_TEMPLATES.map((tpl) => (
          <button
            key={tpl.label}
            type="button"
            onClick={() => {
              if (clipId) {
                updateClip("text", clipId, tpl.styleOnly, true);
                playUiSound("pick");
                showPanelToast(`${tpl.label} style applied`);
              } else {
                addTextAtPlayhead(tpl.preview, tpl.styleOnly, tpl.label);
              }
            }}
            className="editor-tile group flex flex-col overflow-hidden rounded-editor-md border border-editor-border bg-editor-card text-left hover:border-editor-accent/50 cursor-pointer"
          >
            <span className="flex aspect-[16/10] items-center justify-center overflow-hidden bg-editor-elevated px-2">
              <span
                className="truncate px-1.5 py-0.5 text-[13px]"
                style={{
                  fontFamily: tpl.styleOnly.fontFamily,
                  fontWeight: tpl.styleOnly.bold ? 700 : 400,
                  color: tpl.styleOnly.color,
                  backgroundColor: tpl.styleOnly.bgColor ?? "transparent",
                  WebkitTextStroke: tpl.styleOnly.strokeColor ? `0.5px ${tpl.styleOnly.strokeColor}` : undefined,
                  textTransform: tpl.styleOnly.textTransform,
                  letterSpacing: tpl.styleOnly.letterSpacingPx,
                }}
              >
                {tpl.preview}
              </span>
            </span>
            <span className="px-2 py-1.5 text-[11px] font-medium text-editor-text-muted group-hover:text-editor-text">{tpl.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
