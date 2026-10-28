"use client";

// Text panel — three tabs (header + tab bar live in SidebarTabs):
//   Basic      add a text box or a preset at the playhead.
//   Templates  styled looks: restyle the selected text, or add one.
//   AI write   hook / title / CTA ideas from a one-line brief.
// Rich editing, typography and animation live in the properties panel once a
// text clip is selected — see properties/TextClipProps.tsx and
// properties/text/LexicalTextEditor.tsx.

import React from "react";
import AddTextSection from "./text/AddTextSection";
import TemplatesGallery from "./text/TemplatesGallery";
import AiWriteSection from "./text/AiWriteSection";

export default function TextPanel({ tab }: { tab: "basic" | "templates" | "ai" }) {
  return (
    <div className="editor-stagger flex flex-col gap-3 p-3">
      {tab === "basic" && <AddTextSection />}
      {tab === "templates" && <TemplatesGallery />}
      {tab === "ai" && <AiWriteSection />}
      {tab === "basic" && (
        <p className="px-0.5 text-[10.5px] leading-snug text-editor-text-faint">
          Text is added at the playhead. Drag it on the preview to position it; edit words, font and animation on the right.
        </p>
      )}
    </div>
  );
}
