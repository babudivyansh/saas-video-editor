"use client";

// Version history: earlier copies of this project's timeline, kept by the
// server as you edit (one every few minutes), and whenever a save conflict or
// a restore replaces one. Restoring keeps the current copy here too, so a
// restore can be undone the same way. Full screen, like Export.

import React, { useEffect, useState } from "react";
import { History, Loader2 } from "lucide-react";
import { Modal } from "@/app/components/ui/Modal";
import { Button } from "@/app/components/ui/Button";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import type { TimelineDoc } from "@/lib/editor/types";
import { useEditorStore } from "../store/editorStore";
import { clientAuthToken } from "@/lib/client-session";

interface VersionRow {
  id: string;
  version: number;
  reason: string;
  clipCount: number;
  durationSec: number;
  createdAt: string;
}

const REASON: Record<string, string> = {
  autosave: "While editing",
  overwrite: "Replaced by “keep my version”",
  restore: "Before a restore",
  conflict: "This browser’s copy, set aside in a conflict",
};

const fmtLength = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameDay ? `Today, ${time}` : `${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}

export default function VersionHistory() {
  const open = useEditorStore((s) => s.historyOpen);
  const setOpen = useEditorStore((s) => s.setHistoryOpen);
  const projectId = useEditorStore((s) => s.projectId);
  const saveState = useEditorStore((s) => s.saveState);
  const [rows, setRows] = useState<VersionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<VersionRow | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/versions`, {
          headers: { Authorization: `Bearer ${clientAuthToken()}` },
        });
        if (!res.ok) throw new Error();
        const { versions } = await res.json();
        if (!cancelled) setRows(versions as VersionRow[]);
      } catch {
        if (!cancelled) {
          setError("Could not load version history.");
          setRows([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  const restore = async () => {
    if (!pick || !projectId) return;
    setRestoring(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/versions/${pick.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${clientAuthToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: useEditorStore.getState().editorVersion }),
      });
      if (res.status === 409) {
        setError("This project was saved somewhere else. Resolve that first, then restore.");
        useEditorStore.getState().markSaved("conflict");
        return;
      }
      if (!res.ok) throw new Error();
      const { project } = await res.json();
      useEditorStore.getState().loadProject(project.id, (project.editorDoc as TimelineDoc) ?? null, project.editorVersion);
      setPick(null);
      close();
    } catch {
      setError("Could not restore that version.");
    } finally {
      setRestoring(false);
      setPick(null);
    }
  };

  const close = () => {
    setRows(null);
    setError(null);
    setOpen(false);
  };

  if (!open) return null;
  const unsaved = saveState === "dirty" || saveState === "saving" || saveState === "conflict";

  return (
    <Modal open onClose={close} title="Version history" variant="fullscreen">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <p className="text-[13px] text-fg-muted">
          Clipiro keeps a copy of this project every few minutes while you edit, and whenever a version is replaced. The newest 30 are kept.
        </p>
        {error && (
          <p role="alert" className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-[13px] text-error">
            {error}
          </p>
        )}

        {rows === null ? (
          <div className="flex items-center gap-2 py-10 text-[13px] text-fg-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading versions…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-12 text-center">
            <History className="h-5 w-5 text-fg-subtle" aria-hidden="true" />
            <p className="text-sm font-medium text-fg">No earlier versions yet</p>
            <p className="max-w-sm text-[13px] text-fg-muted">Keep editing — a copy is kept every few minutes, so you can always go back.</p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line">
            {rows.map((v) => (
              <li key={v.id} className="flex items-center gap-4 bg-surface-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{when(v.createdAt)}</p>
                  <p className="text-[12px] text-fg-muted">
                    {REASON[v.reason] ?? "Saved copy"} · {v.clipCount} clips · {fmtLength(v.durationSec)}
                  </p>
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={() => setPick(v)}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={pick !== null}
        title="Restore this version?"
        message={`The project goes back to the copy from ${pick ? when(pick.createdAt) : ""}. ${
          unsaved ? "Changes here that haven't saved yet will be replaced. " : ""
        }What you have now is kept in Version history, so you can come back to it.`}
        confirmLabel={restoring ? "Restoring…" : "Restore"}
        confirmDisabled={restoring}
        onConfirm={restore}
        onClose={() => setPick(null)}
      />
    </Modal>
  );
}
