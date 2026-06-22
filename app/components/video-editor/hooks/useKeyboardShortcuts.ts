"use client";

import { useEffect } from "react";
import { useEditorStore } from "../store/editorStore";

export function useKeyboardShortcuts() {
  const store = useEditorStore;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const s = store.getState();
      const target = e.target as HTMLElement;
      // Don't fire when typing in an input/textarea
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        s.undo();
        return;
      }
      if (ctrl && (e.key === "Z" || (e.key === "z" && e.shiftKey) || e.key === "y")) {
        e.preventDefault();
        s.redo();
        return;
      }
      if (ctrl && e.key === "s") {
        e.preventDefault();
        // Trigger save (handled by useAutoSave)
        s.setSaveStatus("unsaved");
        return;
      }
      if (ctrl && e.key === "d") {
        e.preventDefault();
        const id = s.selectedClipId;
        if (id) s.duplicateClip(id);
        return;
      }
      if (ctrl && e.key === "c") {
        // Copy — store clip in clipboard (sessionStorage)
        const id = s.selectedClipId;
        if (id) {
          const clip = s.present.tracks.flatMap(t => t.clips).find(c => c.id === id);
          if (clip) sessionStorage.setItem("ve_clipboard", JSON.stringify(clip));
        }
        return;
      }
      if (ctrl && e.key === "v") {
        // Paste
        const raw = sessionStorage.getItem("ve_clipboard");
        if (raw) {
          try {
            const clip = JSON.parse(raw);
            const track = s.present.tracks.find(t => t.id === clip.trackId);
            if (track) {
              s.addClip(clip.trackId, {
                ...clip,
                start: s.currentTime,
              });
            }
          } catch { /* ignore */ }
        }
        return;
      }

      // Space = play/pause
      if (e.key === " ") {
        e.preventDefault();
        s.togglePlay();
        return;
      }

      // S = split
      if (e.key === "s" || e.key === "S") {
        const id = s.selectedClipId;
        if (id) {
          e.preventDefault();
          s.splitClipAtTime(id, s.currentTime);
        }
        return;
      }

      // Delete / Backspace = remove selected clip
      if (e.key === "Delete" || e.key === "Backspace") {
        const id = s.selectedClipId;
        if (id) {
          e.preventDefault();
          s.removeClip(id);
        }
        return;
      }

      // M = add marker
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        s.addMarker(s.currentTime);
        return;
      }

      // Left/Right arrow = nudge by 1 frame
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        s.setCurrentTime(Math.max(0, s.currentTime - 1 / s.present.fps));
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        s.setCurrentTime(Math.min(s.duration, s.currentTime + 1 / s.present.fps));
        return;
      }

      // + / - = zoom timeline
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        s.setZoom(s.zoom * 1.25);
        return;
      }
      if (e.key === "-") {
        e.preventDefault();
        s.setZoom(s.zoom / 1.25);
        return;
      }

      // Escape = deselect
      if (e.key === "Escape") {
        s.selectClip(null);
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [store]);
}
