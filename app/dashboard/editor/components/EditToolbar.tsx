"use client";

// Timeline header toolbar: split/copy/paste/duplicate/delete, snapping and a
// shortcut to the Effects panel, each with a hover tooltip naming the tool.
// Undo/redo live in the editor header (redesign A).

import React from "react";
import { Copy, CopyPlus, Magnet, Scissors, Sparkles, Trash2, ClipboardPaste } from "lucide-react";
import { useEditorStore } from "../store/editorStore";
import { IconButton } from "./ui";

export default function EditToolbar() {
  const splitAtPlayhead = useEditorStore((s) => s.splitAtPlayhead);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const copySelected = useEditorStore((s) => s.copySelected);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const pasteAtPlayhead = useEditorStore((s) => s.pasteAtPlayhead);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const toggleSnap = useEditorStore((s) => s.toggleSnap);
  const selection = useEditorStore((s) => s.selection);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);

  return (
    <div className="flex flex-shrink-0 items-center gap-0.5">
      <IconButton
        icon={<Scissors className="h-4 w-4" />}
        label="Split at playhead (S)"
        onClick={splitAtPlayhead}
        size="sm"
        tooltipSide="bottom"
      />
      <IconButton
        icon={<Copy className="h-4 w-4" />}
        label="Copy (Ctrl+C)"
        onClick={copySelected}
        disabled={!selection}
        size="sm"
        tooltipSide="bottom"
      />
      <IconButton
        icon={<ClipboardPaste className="h-4 w-4" />}
        label="Paste (Ctrl+V)"
        onClick={pasteAtPlayhead}
        size="sm"
        tooltipSide="bottom"
      />
      <IconButton
        icon={<CopyPlus className="h-4 w-4" />}
        label="Duplicate (Ctrl+D)"
        onClick={duplicateSelected}
        disabled={!selection}
        size="sm"
        tooltipSide="bottom"
      />
      <IconButton
        icon={<Trash2 className="h-4 w-4" />}
        label="Delete (Del)"
        onClick={deleteSelected}
        disabled={!selection}
        size="sm"
        tooltipSide="bottom"
      />
      <span className="mx-1 h-5 w-px bg-editor-border" />
      <button
        type="button"
        onClick={toggleSnap}
        aria-pressed={snapEnabled}
        title={snapEnabled ? "Snapping on — clips stick to edges and the playhead" : "Snapping off"}
        className={`flex h-7 items-center gap-1.5 rounded-editor-sm px-2 text-[11.5px] font-semibold transition-colors ${snapEnabled ? "bg-editor-accent/15 text-editor-accent" : "text-editor-text-muted hover:bg-editor-card hover:text-editor-text"}`}
      >
        <Magnet className="h-3.5 w-3.5" /> Snap
      </button>
      <IconButton
        icon={<Sparkles className="h-4 w-4" />}
        label="Effects"
        onClick={() => setActivePanel("effect")}
        size="sm"
        tooltipSide="bottom"
      />
    </div>
  );
}
