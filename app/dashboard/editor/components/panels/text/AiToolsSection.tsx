"use client";

// Points at the AI tools tab, which works on the selected text clip (rewrite,
// shorten, expand, translate, punch-up, emojis…).

import React from "react";
import { Sparkles } from "lucide-react";
import { Button, PropertyCard } from "../../ui";
import { useEditorStore } from "../../../store/editorStore";

export default function AiToolsSection() {
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const hasTextSelected = useEditorStore((s) => s.selection?.track === "text");
  return (
    <PropertyCard title="AI Tools" defaultOpen={false}>
      <p className="mb-2 text-[11.5px] leading-snug text-editor-text-muted">
        {hasTextSelected ? "Rewrite, shorten, translate or punch up the selected text." : "Select a text clip, then rewrite, shorten or translate it with AI."}
      </p>
      <Button variant="subtle" size="sm" className="w-full justify-start gap-1.5" onClick={() => setActivePanel("ai")}>
        <Sparkles className="h-3.5 w-3.5" />
        Open AI tools
      </Button>
    </PropertyCard>
  );
}
