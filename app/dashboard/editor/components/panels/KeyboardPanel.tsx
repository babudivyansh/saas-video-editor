"use client";

// Static reference for the shortcuts wired up in hooks/useKeyboardShortcuts.ts
// — kept in sync manually since that hook has no introspectable shortcut list.

import React from "react";

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "Space", action: "Play / pause" },
  { keys: "S", action: "Split clip at playhead" },
  { keys: "Delete / Backspace", action: "Delete selected clip" },
  { keys: "Ctrl/Cmd + Z", action: "Undo" },
  { keys: "Ctrl/Cmd + Y or Shift+Z", action: "Redo" },
  { keys: "Ctrl/Cmd + C", action: "Copy selected clip" },
  { keys: "Ctrl/Cmd + D", action: "Duplicate selected clip" },
  { keys: "Ctrl/Cmd + V", action: "Paste at playhead" },
  { keys: "←  /  →", action: "Nudge playhead one frame" },
  { keys: "Shift + ←  /  →", action: "Nudge playhead one second" },
];

export default function KeyboardPanel() {
  return (
    <div className="flex flex-col gap-1 p-3">
      <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Keyboard shortcuts</p>
      {SHORTCUTS.map((s) => (
        <div
          key={s.keys}
          className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2"
        >
          <span className="text-xs text-zinc-300">{s.action}</span>
          <kbd className="whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-300">
            {s.keys}
          </kbd>
        </div>
      ))}
      <p className="mt-2 px-1 text-[10px] leading-snug text-zinc-500">
        Shortcuts are disabled while typing in a text field so they never interrupt editing.
      </p>
    </div>
  );
}
