"use client";

// Compact edit-tool row directly under the preview player: undo/redo/split/
// delete + snap toggle. Split out of the timeline dock so it sits where the
// reference layout puts it — right below the player, not inside the track area.

import React from "react";
import { useEditorStore } from "../store/editorStore";

export default function EditToolbar() {
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const toggleSnap = useEditorStore((s) => s.toggleSnap);
  const splitAtPlayhead = useEditorStore((s) => s.splitAtPlayhead);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const undoAction = useEditorStore((s) => s.undoAction);
  const redoAction = useEditorStore((s) => s.redoAction);
  const selection = useEditorStore((s) => s.selection);

  return (
    <div className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5">
      <ToolButton label="Undo (Ctrl+Z)" onClick={undoAction}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolButton>
      <ToolButton label="Redo (Ctrl+Y)" onClick={redoAction}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <path d="M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolButton>
      <span className="mx-1 h-5 w-px bg-zinc-800" />
      <ToolButton label="Split at playhead (S)" onClick={splitAtPlayhead}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <circle cx="6" cy="6" r="2.5" />
          <circle cx="6" cy="18" r="2.5" />
          <path d="M20 4L8 16M14.5 14.5L20 20M8 8l4 4" strokeLinecap="round" />
        </svg>
      </ToolButton>
      <ToolButton label="Copy (Ctrl+C)" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <rect x="9" y="9" width="11" height="11" rx="1.5" />
          <path d="M5 15V5a2 2 0 012-2h10" />
        </svg>
      </ToolButton>
      <ToolButton label="Delete selected (Del)" onClick={deleteSelected} disabled={!selection}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 13h8l1-13" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolButton>
      <span className="mx-1 h-5 w-px bg-zinc-800" />
      <button
        onClick={toggleSnap}
        className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
          snapEnabled ? "bg-violet-600/15 text-violet-400" : "text-zinc-500 hover:text-zinc-200"
        }`}
        title="Snap to clip edges"
      >
        Snap
      </button>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
    >
      {children}
    </button>
  );
}
