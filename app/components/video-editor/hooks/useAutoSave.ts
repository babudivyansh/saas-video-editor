"use client";

import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/editorStore";

function token() {
  return typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "";
}

// Module-level ref so the save function is stateless
let _lastSavedDoc = "";

async function saveProject(projectId: string, doc: unknown, projectName: string) {
  const docStr = JSON.stringify(doc);
  if (docStr === _lastSavedDoc) return;

  useEditorStore.getState().setSaveStatus("saving");
  try {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ editorDoc: doc, title: projectName }),
    });
    if (res.ok) {
      _lastSavedDoc = docStr;
      useEditorStore.getState().setSaveStatus("saved");
    } else {
      useEditorStore.getState().setSaveStatus("error");
    }
  } catch {
    useEditorStore.getState().setSaveStatus("error");
  }
}

export function useAutoSave() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe((state, prev) => {
      if (state.present === prev.present) return;
      if (!state.projectId) return;
      if (state.saveStatus === "saving") return;

      // Mark unsaved immediately
      if (state.saveStatus !== "unsaved") {
        useEditorStore.getState().setSaveStatus("unsaved");
      }

      // Debounce auto-save to 30s
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const s = useEditorStore.getState();
        if (s.projectId) saveProject(s.projectId, s.present, s.projectName);
      }, 30_000);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Save on beforeunload
  useEffect(() => {
    const beforeUnload = () => {
      const s = useEditorStore.getState();
      if (!s.projectId) return;
      const blob = new Blob(
        [JSON.stringify({ editorDoc: s.present, title: s.projectName })],
        { type: "application/json" },
      );
      navigator.sendBeacon(`/api/projects/${s.projectId}`, blob);
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
}
