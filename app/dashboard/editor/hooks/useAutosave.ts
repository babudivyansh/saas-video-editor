"use client";

// Debounced autosave: whenever the doc changes and saveState is "dirty",
// PATCH the project's editorDoc after 1.5s of quiet. Export blocks until
// saveState === "saved", so the server always renders what's in the DB.

import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/editorStore";

const DEBOUNCE_MS = 1500;

export function useAutosave() {
  const doc = useEditorStore((s) => s.doc);
  const projectId = useEditorStore((s) => s.projectId);
  const saveState = useEditorStore((s) => s.saveState);
  const markSaved = useEditorStore((s) => s.markSaved);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!projectId || saveState !== "dirty") return;
    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(async () => {
      markSaved("saving");
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ editorDoc: useEditorStore.getState().doc }),
        });
        if (!res.ok) throw new Error("save failed");
        // Doc may have changed again while the request was in flight.
        markSaved(useEditorStore.getState().doc === doc ? "saved" : "dirty");
      } catch {
        markSaved("error");
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [doc, projectId, saveState, markSaved]);
}
