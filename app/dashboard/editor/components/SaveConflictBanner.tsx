"use client";

// Shown under the header when autosave hits a conflict (this project was saved
// from another tab or device after this one last saved). Puts the two
// versions side by side and lets the user pick: keep this one (saved over the
// other) or load the other one. Whichever is not kept goes to Version
// history, so neither choice loses work.

import React, { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { TimelineDoc } from "@/lib/editor/types";
import { docDuration } from "@/lib/editor/doc-utils";
import { useEditorStore } from "../store/editorStore";
import { keepMyVersion, reloadLatestProject } from "../hooks/useAutosave";
import { Button } from "./ui";

interface Side {
  clips: number;
  length: number;
  savedAt?: string;
}

function summarize(doc: TimelineDoc | null | undefined): Omit<Side, "savedAt"> {
  if (!doc?.tracks) return { clips: 0, length: 0 };
  const clips = Object.values(doc.tracks).reduce((n, t) => n + (Array.isArray(t) ? t.length : 0), 0);
  return { clips, length: docDuration(doc) };
}

const fmtLength = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function ago(iso?: string): string {
  if (!iso) return "";
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.round(sec / 60)} min ago`;
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function SaveConflictBanner() {
  const saveState = useEditorStore((s) => s.saveState);
  const projectId = useEditorStore((s) => s.projectId);
  const doc = useEditorStore((s) => s.doc);
  const setHistoryOpen = useEditorStore((s) => s.setHistoryOpen);
  const [other, setOther] = useState<Side | null>(null);
  const [busy, setBusy] = useState<"keep" | "load" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const conflict = saveState === "conflict";

  useEffect(() => {
    if (!conflict || !projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (!res.ok) return;
        const { project } = await res.json();
        if (!cancelled) setOther({ ...summarize(project.editorDoc as TimelineDoc | null), savedAt: project.updatedAt });
      } catch {
        // the comparison is a nicety; both buttons still work without it
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conflict, projectId]);

  if (!conflict || !projectId) return null;
  const mine = summarize(doc);

  const keep = async () => {
    setBusy("keep");
    setError(null);
    const r = await keepMyVersion(projectId);
    setBusy(null);
    if (!r.ok) setError(r.error ?? "Could not save your version.");
  };

  const load = async () => {
    setBusy("load");
    setError(null);
    // Set this browser's copy aside first so loading the other one loses nothing.
    try {
      await fetch(`/api/projects/${projectId}/versions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ doc: useEditorStore.getState().doc, version: useEditorStore.getState().editorVersion }),
      });
    } catch {
      // fall through — the user asked for the other version
    }
    const r = await reloadLatestProject(projectId);
    setBusy(null);
    if (!r.ok) setError(r.error ?? "Could not load the other version.");
  };

  return (
    <div role="alert" className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-warning/30 bg-warning/10 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-editor-text">This project was saved somewhere else</p>
          <p className="text-[11.5px] text-editor-text-muted">
            Another tab or device saved it after this one. Pick the version to keep — the other goes to Version history.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11.5px]">
        <span className="rounded-editor-sm border border-editor-border bg-editor-card px-2 py-1 text-editor-text-muted">
          <b className="font-semibold text-editor-text">This tab</b> · {mine.clips} clips · {fmtLength(mine.length)} · not saved
        </span>
        <span className="rounded-editor-sm border border-editor-border bg-editor-card px-2 py-1 text-editor-text-muted">
          <b className="font-semibold text-editor-text">Other version</b>
          {other ? ` · ${other.clips} clips · ${fmtLength(other.length)} · saved ${ago(other.savedAt)}` : " · loading…"}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {error && <span className="text-[11.5px] font-semibold text-error">{error}</span>}
        <button type="button" onClick={() => setHistoryOpen(true)} className="text-[11.5px] text-editor-text-muted underline-offset-2 hover:text-editor-text hover:underline">
          Version history
        </button>
        <Button variant="subtle" size="sm" disabled={busy !== null} onClick={load} className="gap-1.5">
          {busy === "load" && <Loader2 className="h-3 w-3 animate-spin" />} Load the other version
        </Button>
        <Button variant="primary" size="sm" disabled={busy !== null} onClick={keep} className="gap-1.5">
          {busy === "keep" && <Loader2 className="h-3 w-3 animate-spin" />} Keep my version
        </Button>
      </div>
    </div>
  );
}
