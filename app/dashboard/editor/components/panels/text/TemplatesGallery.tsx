"use client";

// Applies STYLE ONLY to the selected text clip — never touches its
// text/richText content. See TEXT_TEMPLATES in textPresets.ts.

import React from "react";
import { Palette } from "lucide-react";
import { useEditorStore } from "../../../store/editorStore";
import { EmptyState } from "../../ui";
import { TEXT_TEMPLATES } from "./textPresets";

export default function TemplatesGallery() {
  const selection = useEditorStore((s) => s.selection);
  const updateClip = useEditorStore((s) => s.updateClip);

  if (selection?.track !== "text") {
    return <EmptyState icon={<Palette className="h-5 w-5" />} message="Select a text layer to apply a template." />;
  }
  const clipId = selection.clipId;

  return (
    <div className="grid grid-cols-2 gap-2">
      {TEXT_TEMPLATES.map((tpl) => (
        <button
          key={tpl.label}
          type="button"
          onClick={() => updateClip("text", clipId, tpl.styleOnly, true)}
          className="overflow-hidden rounded-editor-md border border-editor-border bg-editor-card p-2.5 text-left transition-colors hover:border-editor-accent cursor-pointer"
        >
          <p className="text-[9px] font-semibold uppercase tracking-wide text-editor-text-faint">{tpl.label}</p>
          <p
            className="mt-1 truncate text-xs"
            style={{
              fontFamily: tpl.styleOnly.fontFamily,
              fontWeight: tpl.styleOnly.bold ? 700 : 400,
              color: tpl.styleOnly.color,
              backgroundColor: tpl.styleOnly.bgColor ?? "transparent",
              WebkitTextStroke: tpl.styleOnly.strokeColor ? `0.5px ${tpl.styleOnly.strokeColor}` : undefined,
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
