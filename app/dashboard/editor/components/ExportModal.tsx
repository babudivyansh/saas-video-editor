"use client";

// Export flow: confirm credit cost → wait for autosave to flush → POST
// /api/editor/render → poll the project every 3s → download link.
// The server renders from the saved editorDoc in the DB, never from a client
// payload, so the "waiting for save" gate matters.

import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useEditorStore } from "../store/editorStore";
import { docDuration } from "@/lib/editor/doc-utils";

type Stage = "confirm" | "waiting-save" | "rendering" | "done" | "error";

const CREDIT_COST = 1;
const POLL_MS = 3000;

export default function ExportModal() {
  const { user, refreshUser } = useAuth();
  const setExportOpen = useEditorStore((s) => s.setExportOpen);
  const projectId = useEditorStore((s) => s.projectId);
  const doc = useEditorStore((s) => s.doc);
  const saveState = useEditorStore((s) => s.saveState);

  const [stage, setStage] = useState<Stage>("confirm");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const close = () => {
    if (poll.current) clearInterval(poll.current);
    setExportOpen(false);
  };

  // If the user clicked Export while a save was pending, start once it flushes.
  useEffect(() => {
    if (stage === "waiting-save" && saveState === "saved") startRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, saveState]);

  useEffect(() => () => {
    if (poll.current) clearInterval(poll.current);
  }, []);

  async function startRender() {
    setStage("rendering");
    setProgress(0);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/editor/render", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Export failed to start");
      }

      poll.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/projects/${projectId}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          });
          const { project } = await r.json();
          setProgress(project.progress ?? 0);
          if (project.status === "completed" && project.videoUrl) {
            if (poll.current) clearInterval(poll.current);
            setVideoUrl(project.videoUrl);
            setStage("done");
            refreshUser();
          } else if (project.status === "failed") {
            if (poll.current) clearInterval(poll.current);
            setError("Render failed — your credit was refunded.");
            setStage("error");
            refreshUser();
          }
        } catch {
          /* transient poll error — keep polling */
        }
      }, POLL_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
      setStage("error");
    }
  }

  const onConfirm = () => {
    if (doc.tracks.video.length === 0) {
      setError("Add at least one video clip before exporting.");
      setStage("error");
      return;
    }
    if ((user?.credits ?? 0) < CREDIT_COST) {
      setError("Not enough credits. Top up to export.");
      setStage("error");
      return;
    }
    if (saveState !== "saved") setStage("waiting-save");
    else startRender();
  };

  const duration = docDuration(doc);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={stage === "rendering" ? undefined : close} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-card-border bg-white p-6 shadow-card-hover">
        <h2 className="text-lg font-bold text-ink">Export video</h2>

        {stage === "confirm" && (
          <>
            <div className="mt-4 space-y-2 rounded-xl bg-surface p-4 text-sm text-ink">
              <Row label="Aspect ratio" value={doc.aspect} />
              <Row label="Duration" value={`${Math.round(duration)}s`} />
              <Row label="Resolution" value={doc.aspect === "16:9" ? "1920×1080" : doc.aspect === "1:1" ? "1080×1080" : "1080×1920"} />
              <Row label="Cost" value={`${CREDIT_COST} credit`} />
              <Row label="Your balance" value={`${user?.credits ?? 0} credits`} />
            </div>
            <p className="mt-3 text-xs leading-snug text-ink-soft">
              Rendering happens on our servers — you can keep editing other projects while it runs. Preview and export
              are closely matched, though text rendering may differ by a pixel or two.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={close} className="rounded-full px-4 py-2 text-sm font-semibold text-ink-soft hover:text-ink cursor-pointer">
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-ink hover:bg-brand-dark cursor-pointer"
              >
                Export ({CREDIT_COST} credit)
              </button>
            </div>
          </>
        )}

        {(stage === "rendering" || stage === "waiting-save") && (
          <div className="mt-5">
            <p className="text-sm text-ink-soft">
              {stage === "waiting-save" ? "Saving your latest changes…" : "Rendering your video…"}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-brand transition-all duration-500"
                style={{ width: `${Math.max(progress, 4)}%` }}
              />
            </div>
            <p className="mt-2 text-right text-xs text-ink-soft">{progress}%</p>
          </div>
        )}

        {stage === "done" && videoUrl && (
          <div className="mt-5">
            <p className="text-sm text-ink">Your video is ready 🎉</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={close} className="rounded-full px-4 py-2 text-sm font-semibold text-ink-soft hover:text-ink cursor-pointer">
                Close
              </button>
              <a
                href={videoUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-ink hover:bg-brand-dark"
              >
                Download MP4
              </a>
            </div>
          </div>
        )}

        {stage === "error" && (
          <div className="mt-5">
            <p className="text-sm text-red-600">{error}</p>
            <div className="mt-4 flex justify-end">
              <button onClick={close} className="rounded-full border border-card-border px-4 py-2 text-sm font-semibold text-ink hover:bg-surface cursor-pointer">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-soft">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
