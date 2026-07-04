"use client";

// Right panel: contextual properties for the selected clip.

import React from "react";
import { useEditorStore } from "../store/editorStore";
import VideoClipProps from "./properties/VideoClipProps";
import TextClipProps from "./properties/TextClipProps";
import AudioClipProps from "./properties/AudioClipProps";

export default function PropertiesPanel() {
  const selection = useEditorStore((s) => s.selection);
  const doc = useEditorStore((s) => s.doc);

  let content: React.ReactNode = null;
  if (selection) {
    if (selection.track === "video") {
      const clip = doc.tracks.video.find((c) => c.id === selection.clipId);
      if (clip) content = <VideoClipProps clip={clip} />;
    } else if (selection.track === "text") {
      const clip = doc.tracks.text.find((c) => c.id === selection.clipId);
      if (clip) content = <TextClipProps clip={clip} />;
    } else {
      const clip = doc.tracks.audio.find((c) => c.id === selection.clipId);
      if (clip) content = <AudioClipProps clip={clip} />;
    }
  }

  return (
    <aside className="w-64 flex-shrink-0 overflow-y-auto border-l border-card-border bg-white">
      {content ?? (
        <p className="p-4 text-xs leading-relaxed text-ink-soft">
          Select a clip on the timeline (or text on the preview) to edit its properties.
        </p>
      )}
    </aside>
  );
}
