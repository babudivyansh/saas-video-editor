"use client";

// Caption panel: generate transcript-synced captions for the whole timeline,
// browse/quick-edit every cue, apply style templates, and (stubbed) AI tools.
// This is NOT the Text panel — captions are a dedicated timeline-based
// CaptionClip track, not Lexical rich text. Per-cue styling/highlight/
// animation/position live in the properties panel on the right once a cue is
// selected — see properties/CaptionClipProps.tsx.

import React from "react";
import GenerateSection from "./caption/GenerateSection";
import CaptionListSection from "./caption/CaptionListSection";
import TemplatesGallery from "./caption/TemplatesGallery";
import AiToolsSection from "./caption/AiToolsSection";

export default function CaptionPanel() {
  return (
    <div className="flex flex-col gap-4 p-3">
      <div>
        <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-editor-text-muted">Generate Captions</p>
        <GenerateSection />
      </div>
      <div>
        <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-editor-text-muted">Caption List</p>
        <CaptionListSection />
      </div>
      <div>
        <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-editor-text-muted">Caption Templates</p>
        <TemplatesGallery />
      </div>
      <AiToolsSection />
      <p className="px-0.5 text-[10px] leading-snug text-editor-text-faint">
        Select a cue on the timeline or in the list above to edit its text, styling, word highlighting, and animation in the panel on the right.
      </p>
    </div>
  );
}
