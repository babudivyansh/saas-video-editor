"use client";

// Whole-track caption clean-ups that run instantly in the browser, plus a way
// into the AI tools tab for model-backed edits (rewrite, translate…) of one cue.

import React from "react";
import { Scissors, Smile, WrapText, Sparkles } from "lucide-react";
import { showPanelToast } from "../../ui";
import { playUiSound } from "../../../hooks/useUiSound";
import { useEditorStore } from "../../../store/editorStore";
import { applyFreeOperation } from "../../../hooks/useAiText";
import type { AiTextOperation } from "@/lib/editor/ai-text";

const ACTIONS: { op: AiTextOperation; label: string; icon: typeof Scissors }[] = [
  { op: "fillerWords", label: "Remove filler words", icon: Scissors },
  { op: "emojis", label: "Add emojis", icon: Smile },
  { op: "lineBreaks", label: "Auto line breaks", icon: WrapText },
];

const row =
  "editor-press flex items-center gap-2.5 rounded-editor-md border border-editor-border bg-editor-card px-3 py-2.5 text-left text-[12.5px] text-editor-text hover:border-editor-accent/50 disabled:opacity-40";

export default function AiToolsSection() {
  const count = useEditorStore((s) => s.doc.tracks.caption.length);
  const applyToCaptions = useEditorStore((s) => s.applyCaptionTextEdit);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);

  return (
    <div className="flex flex-col gap-1.5">
      {ACTIONS.map(({ op, label, icon: Icon }) => (
        <button
          key={op}
          type="button"
          disabled={count === 0}
          onClick={() => {
            const n = applyToCaptions((t) => applyFreeOperation(op, t) ?? t);
            playUiSound(n > 0 ? "go" : "tap");
            showPanelToast(n > 0 ? `${label}: ${n} caption${n === 1 ? "" : "s"} changed` : `${label}: nothing to change`);
          }}
          className={row}
        >
          <Icon className="h-4 w-4 text-editor-accent" />
          {label}
          <span className="ml-auto rounded bg-editor-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-editor-accent">INSTANT</span>
        </button>
      ))}
      <button type="button" onClick={() => setActivePanel("ai")} className={row}>
        <Sparkles className="h-4 w-4 text-[var(--primary)]" />
        Rewrite or translate a caption…
      </button>
      <p className="px-0.5 text-[10.5px] text-editor-text-faint">Every change can be undone with Ctrl+Z.</p>
    </div>
  );
}
