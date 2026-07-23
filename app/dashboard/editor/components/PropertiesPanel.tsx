"use client";

// Right panel: contextual properties for the selected clip.

import React, { useEffect, useState } from "react";
import { MousePointerClick, X, SlidersHorizontal } from "lucide-react";
import { useEditorStore } from "../store/editorStore";
import { useIsCompactEditor } from "../hooks/useIsCompactEditor";
import { EmptyState } from "./ui";
import { AudioProperties, CaptionProperties, ImageProperties, TextProperties, VideoProperties } from "./properties/PropertiesPanelShell";

export default function PropertiesPanel() {
  const selection = useEditorStore((s) => s.selection);
  const doc = useEditorStore((s) => s.doc);
  const isCompact = useIsCompactEditor();
  const [open, setOpen] = useState(false);

  // Below `lg`, this panel has no always-visible icon rail of its own (unlike
  // SidebarTabs), so selecting a clip is the natural open trigger; a manual
  // toggle + close button cover the rest.
  useEffect(() => {
    if (selection) setOpen(true);
  }, [selection]);

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
    <>
      {/* Backdrop — overlay mode only (below lg), dismisses the panel */}
      {isCompact && open && (
        <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Manual toggle — overlay mode only, mirrors SidebarTabs' toggle on the opposite edge */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close properties" : "Open properties"}
        title={open ? "Close properties" : "Open properties"}
        className="fixed top-1/2 right-0 z-50 flex h-8 w-6 -translate-y-1/2 items-center justify-center rounded-editor-sm border border-editor-border bg-editor-elevated text-editor-text-muted shadow-editor-sm transition-colors hover:bg-editor-card hover:text-editor-text cursor-pointer lg:hidden"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
      </button>

      <aside
        className={`w-72 flex-shrink-0 overflow-y-auto border-l border-editor-border bg-editor-panel transition-transform duration-200 fixed inset-y-0 right-0 z-40 shadow-2xl lg:static lg:inset-auto lg:right-auto lg:z-auto lg:shadow-none lg:translate-x-0 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <button
          onClick={() => setOpen(false)}
          aria-label="Close properties"
          className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-editor-sm text-editor-text-muted hover:bg-editor-card hover:text-editor-text cursor-pointer lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
        {content ?? (
          <EmptyState
            icon={<MousePointerClick className="h-6 w-6" />}
            message="Select a clip on the timeline (or text on the preview) to edit its properties."
          />
        )}
      </aside>
    </>
  );
}
