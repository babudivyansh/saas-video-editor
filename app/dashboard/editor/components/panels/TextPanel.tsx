"use client";

// Text panel: quick-add actions and a style-template gallery, plus a stubbed
// AI tools section. Rich editing, typography, and animation controls live in
// the properties panel once a text clip is selected — see
// properties/TextClipProps.tsx and properties/text/LexicalTextEditor.tsx.

import React from "react";
import AddTextSection from "./text/AddTextSection";
import TemplatesGallery from "./text/TemplatesGallery";
import AiToolsSection from "./text/AiToolsSection";

export default function TextPanel() {
  return (
    <div className="flex flex-col gap-4 p-3">
      <div>
        <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-editor-text-muted">Add Text</p>
        <AddTextSection />
      </div>
      <div>
        <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-editor-text-muted">Text Templates</p>
        <TemplatesGallery />
      </div>
      <AiToolsSection />
      <p className="px-0.5 text-[10px] leading-snug text-editor-text-faint">
        Text is added at the playhead. Drag it on the preview to position, and edit content, typography, and animation in the panel on the right.
      </p>
    </div>
  );
}
