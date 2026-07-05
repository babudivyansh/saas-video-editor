"use client";

// Right panel: contextual properties for the selected clip.

import React from "react";
import { useEditorStore } from "../store/editorStore";
import VideoClipProps from "./properties/VideoClipProps";
import TextClipProps from "./properties/TextClipProps";
import AudioClipProps from "./properties/AudioClipProps";
import ImageClipProps from "./properties/ImageClipProps";

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
    } else if (selection.track === "image") {
      const clip = doc.tracks.image.find((c) => c.id === selection.clipId);
      if (clip) content = <ImageClipProps clip={clip} />;
    } else {
      const clip = doc.tracks.audio.find((c) => c.id === selection.clipId);
      if (clip) content = <AudioClipProps clip={clip} />;
    }
  }

  return (
    <aside className="w-64 flex-shrink-0 overflow-y-auto border-l border-zinc-800 bg-zinc-900">
      {content ?? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
              <path d="M3 8.5l1-3.5h16l1 3.5" strokeLinejoin="round" />
              <rect x="3" y="8.5" width="18" height="12" rx="1.5" />
              <path d="M6 5l1.5 3.5M11 5l1.5 3.5M16 5l1.5 3.5" strokeLinecap="round" />
            </svg>
          </span>
          <p className="text-xs leading-relaxed text-zinc-500">
            Select a clip on the timeline (or text on the preview) to edit its properties.
          </p>
        </div>
      )}
    </aside>
  );
}
