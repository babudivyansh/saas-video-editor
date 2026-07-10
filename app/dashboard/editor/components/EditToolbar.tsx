"use client";

// Timeline header toolbar: undo/redo/split/copy/paste/duplicate/delete + an
// effects placeholder, each with a hover tooltip naming the tool.

import React from "react";
import { Copy, CopyPlus, Redo2, Scissors, Sparkles, Trash2, Undo2, ClipboardPaste } from "lucide-react";
import { useEditorStore } from "../store/editorStore";
import { IconButton } from "./ui";

export default function EditToolbar() {
  const splitAtPlayhead = useEditorStore((s) => s.splitAtPlayhead);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const copySelected = useEditorStore((s) => s.copySelected);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const pasteAtPlayhead = useEditorStore((s) => s.pasteAtPlayhead);
  const undoAction = useEditorStore((s) => s.undoAction);
  const redoAction = useEditorStore((s) => s.redoAction);
  const selection = useEditorStore((s) => s.selection);

  return (
    <div className="flex flex-shrink-0 items-center gap-0.5">
      <IconButton icon={<Undo2 className="h-4 w-4" />} label="Undo (Ctrl+Z)" onClick={undoAction} size="sm" tooltipSide="bottom" />
      <IconButton icon={<Redo2 className="h-4 w-4" />} label="Redo (Ctrl+Y)" onClick={redoAction} size="sm" tooltipSide="bottom" />
      <span className="mx-1 h-5 w-px bg-editor-border" />
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
      <IconButton
        icon={
          <span className="relative">
            <Sparkles className="h-4 w-4" />
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
          </span>
        }
        label="Effects (coming soon)"
        disabled
        size="sm"
        tooltipSide="bottom"
      />
    </div>
  );
}
