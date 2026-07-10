"use client";

// Right panel: contextual properties for the selected clip.

import React from "react";
import { MousePointerClick } from "lucide-react";
import { useEditorStore } from "../store/editorStore";
import { EmptyState } from "./ui";
import { AudioProperties, CaptionProperties, ImageProperties, TextProperties, VideoProperties } from "./properties/PropertiesPanelShell";

export default function PropertiesPanel() {
  const selection = useEditorStore((s) => s.selection);
  const doc = useEditorStore((s) => s.doc);

  let content: React.ReactNode = null;
  if (selection) {
    if (selection.track === "video") {
      const clip = doc.tracks.video.find((c) => c.id === selection.clipId);
      if (clip) content = <VideoProperties clip={clip} />;
    } else if (selection.track === "text") {
      const clip = doc.tracks.text.find((c) => c.id === selection.clipId);
      if (clip) content = <TextProperties clip={clip} />;
    } else if (selection.track === "image") {
      const clip = doc.tracks.image.find((c) => c.id === selection.clipId);
      if (clip) content = <ImageProperties clip={clip} />;
    } else if (selection.track === "caption") {
      const clip = doc.tracks.caption.find((c) => c.id === selection.clipId);
      if (clip) content = <CaptionProperties clip={clip} />;
    } else if (selection.track === "audio") {
      const clip = doc.tracks.audio.find((c) => c.id === selection.clipId);
      if (clip) content = <AudioProperties clip={clip} />;
    }
  }

  return (
    <aside className="w-72 flex-shrink-0 overflow-y-auto border-l border-editor-border bg-editor-panel">
      {content ?? (
        <EmptyState
          icon={<MousePointerClick className="h-6 w-6" />}
          message="Select a clip on the timeline (or text on the preview) to edit its properties."
        />
      )}
    </aside>
  );
}
