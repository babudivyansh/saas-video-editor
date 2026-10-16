"use client";

// Right panel: contextual properties for the selected clip.

import React, { useEffect } from "react";
import { MousePointerClick, X, SlidersHorizontal } from "lucide-react";
import { useEditorStore } from "../store/editorStore";
import { useIsCompactEditor } from "../hooks/useIsCompactEditor";
import { useIsPhoneEditor } from "../hooks/useIsPhoneEditor";
import { EmptyState } from "./ui";
import { AudioProperties, CaptionProperties, ImageProperties, TextProperties, VideoProperties } from "./properties/PropertiesPanelShell";

export default function PropertiesPanel() {
  const selection = useEditorStore((s) => s.selection);
  const doc = useEditorStore((s) => s.doc);
  const isCompact = useIsCompactEditor();
  const isPhone = useIsPhoneEditor();
  const open = useEditorStore((s) => s.propertiesOpen);
  const setOpen = useEditorStore((s) => s.setPropertiesOpen);

  // Below `xl`, this panel has no always-visible icon rail of its own (unlike
  // SidebarTabs), so selecting a clip is the natural open trigger; a manual
  // toggle + close button cover the rest. Not on a phone: there the panel is
  // full screen, so it opens from the bottom bar's Edit button instead of
  // covering the timeline on every tap.
  useEffect(() => {
    if (selection && !isPhone) setOpen(true);
  }, [selection, isPhone, setOpen]);

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
      {/* Backdrop — overlay mode only (below xl), dismisses the panel */}
      {isCompact && open && (
        <div data-testid="editor-panel-backdrop" className="fixed inset-0 z-30 bg-black/30 xl:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Manual toggle — overlay mode only, mirrors SidebarTabs' toggle on the opposite edge */}
      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close properties" : "Open properties"}
        title={open ? "Close properties" : "Open properties"}
        className="fixed top-1/2 right-0 z-50 flex h-8 w-6 -translate-y-1/2 items-center justify-center rounded-editor-sm border border-editor-border bg-editor-elevated text-editor-text-muted shadow-editor-sm transition-colors hover:bg-editor-card hover:text-editor-text cursor-pointer max-md:hidden xl:hidden"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
      </button>

      <aside
        className={`w-72 flex-shrink-0 overflow-y-auto border-l max-md:inset-0 max-md:w-full max-md:border-l-0 max-md:pt-12 border-editor-border bg-editor-panel transition-transform duration-200 fixed inset-y-0 right-0 z-40 shadow-2xl xl:static xl:inset-auto xl:right-auto xl:z-auto xl:shadow-none xl:translate-x-0 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {isPhone && (
          <p className="absolute left-4 top-3.5 text-[14px] font-semibold text-editor-text">Edit</p>
        )}
        <button
          onClick={() => setOpen(false)}
          aria-label="Close properties"
          className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-editor-sm text-editor-text-muted hover:bg-editor-card hover:text-editor-text cursor-pointer xl:hidden"
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
