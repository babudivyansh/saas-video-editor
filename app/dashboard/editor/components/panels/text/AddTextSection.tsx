"use client";

import React from "react";
import { Plus } from "lucide-react";
import { useEditorStore } from "../../../store/editorStore";
import { ADD_TEXT_PRESETS } from "./textPresets";
import type { TextClip } from "@/lib/editor/types";
import { showPanelToast } from "../../ui";
import { playUiSound } from "../../../hooks/useUiSound";
import { fmtDuration } from "../shared/assetData";

/** Drops a new text clip at the playhead (with any style overrides) and focuses it for typing. */
export function addTextAtPlayhead(text: string, partial: Partial<TextClip>, label: string) {
  const { currentTime, addTextClip, requestTextFocus } = useEditorStore.getState();
  const id = crypto.randomUUID();
  addTextClip({
    type: "text",
    id,
    timelineStart: currentTime,
    duration: 4,
    text,
    fontFamily: "Arial",
    fontSizePct: 0.05,
    color: "#ffffff",
    bold: false,
    align: "center",
    x: 0.5,
    y: 0.5,
    bgColor: null,
    opacity: 1,
    ...partial,
  });
  requestTextFocus(id);
  playUiSound("add");
  showPanelToast(`${label} added at ${fmtDuration(currentTime)}`);
}

export default function AddTextSection() {
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => addTextAtPlayhead("Your text here", {}, "Text box")}
        className="editor-press flex h-10 items-center justify-center gap-1.5 rounded-editor-md bg-editor-accent text-[13px] font-bold text-editor-bg hover:shadow-[0_0_0_3px_rgba(32,214,138,0.18),0_6px_18px_rgba(32,214,138,0.28)]"
      >
        <Plus className="h-4 w-4" /> Add text box
      </button>
      <div className="editor-stagger-grid grid grid-cols-2 gap-2">
        {ADD_TEXT_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => addTextAtPlayhead(preset.text, preset.partial, preset.label)}
            className="editor-tile group flex flex-col overflow-hidden rounded-editor-md border border-editor-border bg-editor-card text-left hover:border-editor-accent/50 cursor-pointer"
          >
            <span className="flex aspect-[16/10] items-center justify-center overflow-hidden bg-editor-elevated px-2 text-center text-editor-text">
              <span
                className="truncate"
                style={{
                  fontFamily: preset.partial.fontFamily,
                  fontWeight: preset.partial.bold ? 700 : 400,
                  fontSize: Math.round(10 + (preset.partial.fontSizePct ?? 0.05) * 110),
                  backgroundColor: preset.partial.bgColor ?? "transparent",
                  padding: preset.partial.bgColor ? "1px 6px" : undefined,
                }}
              >
                {preset.label === "Body Text" ? "Body text" : preset.text}
              </span>
            </span>
            <span className="px-2 py-1.5 text-[11px] font-medium text-editor-text-muted group-hover:text-editor-text">{preset.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
