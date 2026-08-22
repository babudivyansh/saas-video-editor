"use client";

// Debounced autosave: whenever the doc changes and saveState is "dirty",
// PATCH the project's editorDoc after 1.5s of quiet. Export blocks until
// saveState === "saved", so the server always renders what's in the DB.
//
// Optimistic concurrency (P0-5): every save sends the editorVersion we last
// confirmed from the server. If another tab/device saved first, the server
// rejects with 409 and we do NOT retry with the same stale version or
// silently discard the user's local edits — saveState becomes "conflict" and
// stays there (blocking further autosave attempts against that same stale
// version) until the user explicitly reloads the latest doc via
// resolveConflict(), a deliberate choice, not an automatic one.

import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/editorStore";
import type { TimelineDoc } from "@/lib/editor/types";

const DEBOUNCE_MS = 1500;

export function useAutosave() {
  const doc = useEditorStore((s) => s.doc);
  const projectId = useEditorStore((s) => s.projectId);
  const saveState = useEditorStore((s) => s.saveState);
  const markSaved = useEditorStore((s) => s.markSaved);
  const setEditorVersion = useEditorStore((s) => s.setEditorVersion);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // "conflict" deliberately does not re-trigger here — see file header.
    if (!projectId || saveState !== "dirty") return;
    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(async () => {
      markSaved("saving");
      try {
        const token = localStorage.getItem("token");
        const expectedVersion = useEditorStore.getState().editorVersion;
        const res = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ editorDoc: useEditorStore.getState().doc, expectedVersion }),
        });

        if (res.status === 409) {
          // A newer save already landed elsewhere. Local doc is left exactly
          // as-is — nothing here overwrites it — the user chooses what to do.
          markSaved("conflict");
          return;
        }
        if (!res.ok) throw new Error("save failed");

        const { project } = await res.json();
        if (typeof project?.editorVersion === "number") setEditorVersion(project.editorVersion);
        // Doc may have changed again while the request was in flight.
        markSaved(useEditorStore.getState().doc === doc ? "saved" : "dirty");
      } catch {
        markSaved("error");
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [doc, projectId, saveState, markSaved, setEditorVersion]);
}

/**
 * Recovery action for the "conflict" state: discards the local unsaved doc
 * and replaces it with the server's current version. This is the ONLY path
 * that discards local edits, and it only runs when the user explicitly asks
 * for it (e.g. clicking "Reload latest" in the save-status UI) — never
 * automatically.
 */
export async function reloadLatestProject(projectId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { ok: false, error: "Could not load the latest version." };
    const { project } = await res.json();
    useEditorStore
      .getState()
      .loadProject(project.id, (project.editorDoc as TimelineDoc) ?? null, project.editorVersion);
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not load the latest version." };
  }
}
