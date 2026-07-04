"use client";

// Global editor shortcuts. Skipped while any input/textarea is focused so
// typing in the text panel or title field never triggers timeline actions.
// space = play/pause · S = split · Delete = remove · Ctrl+Z / Ctrl+Y = undo/redo
// ←/→ = nudge playhead one frame (1/30s), with shift = 1s

import { useEffect } from "react";
import { useEditorStore } from "../store/editorStore";

const FRAME = 1 / 30;

export function useKeyboardShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      const s = useEditorStore.getState();

      if (e.code === "Space") {
        e.preventDefault();
        s.setPlaying(!s.playing);
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        s.splitAtPlayhead();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        s.deleteSelected();
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        s.undoAction();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        s.redoAction();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        s.setCurrentTime(s.currentTime - (e.shiftKey ? 1 : FRAME));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        s.setCurrentTime(s.currentTime + (e.shiftKey ? 1 : FRAME));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
