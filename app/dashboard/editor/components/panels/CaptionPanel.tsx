"use client";

// Captions panel — three tabs (header + tab bar live in SidebarTabs):
//   Generate  transcribe the timeline into cues (language, cost, button);
//             jumps to Edit when the cues land.
//   Edit      the transcript, every cue, and one-click clean-ups.
//   Style     the caption templates (same set AutoClip burns in).
// This is NOT the Text panel — captions are a dedicated timeline-based
// CaptionClip track, not Lexical rich text. Per-cue styling/highlight/
// animation/position live in the properties panel on the right once a cue is
// selected — see properties/CaptionClipProps.tsx.

import React from "react";
import { Captions } from "lucide-react";
import GenerateSection from "./caption/GenerateSection";
import CaptionListSection from "./caption/CaptionListSection";
import TranscriptSection from "./caption/TranscriptSection";
import TemplatesGallery from "./caption/TemplatesGallery";
import AiToolsSection from "./caption/AiToolsSection";
import { Button, EmptyState, PanelSection } from "../ui";
import { useEditorStore } from "../../store/editorStore";

export default function CaptionPanel({ tab }: { tab: "generate" | "edit" | "style" }) {
  const count = useEditorStore((s) => s.doc.tracks.caption.length);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);

  if (tab === "generate") {
    return (
      <div className="editor-stagger flex flex-col gap-4 p-3">
        <GenerateSection />
      </div>
    );
  }

  if (tab === "style") {
    return (
      <div className="editor-stagger flex flex-col gap-3 p-3">
        <TemplatesGallery />
        <p className="px-0.5 text-[11px] leading-snug text-editor-text-faint">
          {count > 0 ? "Applies to the selected cue, or to every cue when none is selected." : "Generate captions first — a style applies to the cues on the timeline."}
        </p>
      </div>
    );
  }

  if (count === 0) {
    return (
      <div className="editor-stagger flex flex-col gap-3 p-3">
        <EmptyState icon={<Captions className="h-5 w-5" />} message="No captions yet. Generate them from the speech in your video, then fix any word here." />
        <Button variant="primary" onClick={() => setActivePanel("caption")}>Generate captions</Button>
      </div>
    );
  }

  return (
    <div className="editor-stagger flex flex-col gap-4 p-3">
      <PanelSection title="Transcript">
        <TranscriptSection />
      </PanelSection>
      <PanelSection title={`Cues · ${count}`}>
        <CaptionListSection />
      </PanelSection>
      <PanelSection title="Clean up">
        <AiToolsSection />
      </PanelSection>
      <p className="px-0.5 text-[11px] leading-snug text-editor-text-faint">
        Select a cue to edit its styling, word highlighting and animation in the panel on the right.
      </p>
    </div>
  );
}
