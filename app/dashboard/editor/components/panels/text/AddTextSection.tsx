"use client";

import React from "react";
import { useEditorStore } from "../../../store/editorStore";
import { ADD_TEXT_PRESETS, type AddTextPreset } from "./textPresets";

export default function AddTextSection() {
  const addTextClip = useEditorStore((s) => s.addTextClip);
  const requestTextFocus = useEditorStore((s) => s.requestTextFocus);

  const add = (preset: AddTextPreset) => {
    const currentTime = useEditorStore.getState().currentTime;
    const id = crypto.randomUUID();
    addTextClip({
      type: "text",
      id,
      timelineStart: currentTime,
      duration: 4,
      text: preset.text,
      fontFamily: "Arial",
      fontSizePct: 0.05,
      color: "#ffffff",
      bold: false,
      align: "center",
      x: 0.5,
      y: 0.5,
      bgColor: null,
      opacity: 1,
      ...preset.partial,
    });
    requestTextFocus(id);
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      {ADD_TEXT_PRESETS.map((preset) => {
        const Icon = preset.icon;
        return (
          <button
            key={preset.label}
            type="button"
            onClick={() => add(preset)}
            className="flex flex-col items-center gap-1.5 rounded-editor-md border border-editor-border bg-editor-card py-3 text-center transition-colors hover:border-editor-accent cursor-pointer"
          >
            <Icon className="h-4 w-4 text-editor-text-muted" />
            <span className="text-[10px] font-semibold text-editor-text">{preset.label}</span>
          </button>
        );
      })}
    </div>
  );
}
