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
  const setProjectId = useEditorStore((s) => s.setProjectId);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards the deferred create below: two autosave ticks must never each POST
  // a project. Creating one project per edit burst is precisely the bug this
  // whole path exists to remove.
  const creating = useRef(false);

  useEffect(() => {
    // "conflict" deliberately does not re-trigger here — see file header.
    if (saveState !== "dirty") return;
    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(async () => {
      markSaved("saving");
      try {
        const token = localStorage.getItem("token");

        // Deferred creation: the editor opens with no project at all, and the
        // row is written here, on the first real edit. Opening the editor used
        // to POST a "Untitled project" draft immediately, so every visit left
        // an empty project behind in the user's dashboard.
        let id = useEditorStore.getState().projectId;
        if (!id) {
          if (creating.current) return; // a create is already in flight
          creating.current = true;
          try {
            const createRes = await fetch("/api/projects", {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ title: "Untitled project", productType: "editor" }),
            });
            if (!createRes.ok) throw new Error("create failed");
            const { project } = await createRes.json();
            id = project.id as string;
            setProjectId(id);
            // Keeps a reload pointing at this project instead of starting a
            // second one. Uses the history API rather than router.replace so
            // this hook needs no router context (and so no App Router
            // navigation is triggered mid-save). Should the change still reach
            // useSearchParams, the page's hydration effect short-circuits when
            // the store already holds this id, so the doc is never clobbered.
            window.history.replaceState(null, "", `/dashboard/editor?projectId=${id}`);
          } finally {
            creating.current = false;
          }
        }

        const expectedVersion = useEditorStore.getState().editorVersion;
        const res = await fetch(`/api/projects/${id}`, {
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
  }, [doc, projectId, saveState, markSaved, setEditorVersion, setProjectId]);
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
