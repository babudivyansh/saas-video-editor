"use client";

// Whole-track caption clean-ups that run instantly in the browser, plus a way
// into the AI tools tab for model-backed edits (rewrite, translate…) of one cue.

import React, { useState } from "react";
import { Scissors, Smile, WrapText, Sparkles } from "lucide-react";
import { Button, PropertyCard } from "../../ui";
import { useEditorStore } from "../../../store/editorStore";
import { applyFreeOperation } from "../../../hooks/useAiText";
import type { AiTextOperation } from "@/lib/editor/ai-text";

const ACTIONS: { op: AiTextOperation; label: string; icon: typeof Scissors }[] = [
  { op: "fillerWords", label: "Remove filler words", icon: Scissors },
  { op: "emojis", label: "Add emojis", icon: Smile },
  { op: "lineBreaks", label: "Auto line breaks", icon: WrapText },
];

export default function AiToolsSection() {
  const count = useEditorStore((s) => s.doc.tracks.caption.length);
  const applyToCaptions = useEditorStore((s) => s.applyCaptionTextEdit);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <PropertyCard title="AI Tools" defaultOpen={false}>
      <div className="flex flex-col gap-1.5">
        {ACTIONS.map(({ op, label, icon: Icon }) => (
          <Button
            key={op}
            variant="subtle"
            size="sm"
            disabled={count === 0}
            className="justify-start gap-1.5"
            onClick={() => {
              const n = applyToCaptions((t) => applyFreeOperation(op, t) ?? t);
              setNotice(n > 0 ? `${label}: ${n} caption${n === 1 ? "" : "s"} changed. Ctrl+Z to undo.` : `${label}: nothing to change.`);
            }}
          >
            <Icon className="h-3.5 w-3.5" />
            {label} <span className="ml-auto text-[10.5px] text-editor-text-faint">all captions</span>
          </Button>
        ))}
        <Button variant="subtle" size="sm" className="justify-start gap-1.5" onClick={() => setActivePanel("ai")}>
          <Sparkles className="h-3.5 w-3.5" />
          Rewrite or translate a caption…
        </Button>
        {notice && <p role="status" className="text-[11.5px] text-editor-accent">{notice}</p>}
      </div>
    </PropertyCard>
  );
}
