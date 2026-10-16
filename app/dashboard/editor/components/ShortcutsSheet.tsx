"use client";

// The keyboard shortcuts list, opened from the title menu, the command bar or
// "?". It used to be its own rail tab ("Keys"); a reference sheet doesn't need
// a permanent slot next to the tools.

import React from "react";
import { Modal } from "@/app/components/ui/Modal";
import { useEditorStore } from "../store/editorStore";
import KeyboardPanel from "./panels/KeyboardPanel";

export default function ShortcutsSheet() {
  const open = useEditorStore((s) => s.shortcutsOpen);
  const setOpen = useEditorStore((s) => s.setShortcutsOpen);
  if (!open) return null;
  return (
    <Modal open onClose={() => setOpen(false)} title="Keyboard shortcuts" maxWidth="max-w-md">
      <div className="clipiro-editor -m-2 rounded-editor-md bg-editor-panel">
        <KeyboardPanel />
      </div>
    </Modal>
  );
}
