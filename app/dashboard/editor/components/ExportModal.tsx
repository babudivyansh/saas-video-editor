"use client";

// Export flow: confirm credit cost → wait for autosave to flush → POST
// /api/editor/render → poll the project every 3s → download link.
// The server renders from the saved editorDoc in the DB, never from a client
// payload, so the "waiting for save" gate matters.

import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useEditorStore } from "../store/editorStore";
import { docDuration } from "@/lib/editor/doc-utils";
import { useInsufficientCredits } from "@/app/components/billing/CreditModalContext";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { Modal } from "@/app/components/ui/Modal";
import { Button } from "@/app/components/ui/Button";

type Stage = "confirm" | "waiting-save" | "rendering" | "done" | "error";

const CREDIT_COST = 1;
const POLL_MS = 3000;

export default function ExportModal() {
  const { user, refreshUser } = useAuth();
  const insufficientCredits = useInsufficientCredits();
  const setExportOpen = useEditorStore((s) => s.setExportOpen);
  const projectId = useEditorStore((s) => s.projectId);
  const doc = useEditorStore((s) => s.doc);
  const saveState = useEditorStore((s) => s.saveState);

  const [stage, setStage] = useState<Stage>("confirm");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const fireReviewPrompt = useReviewPromptTrigger();
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const close = () => {
    if (poll.current) clearInterval(poll.current);
    setExportOpen(false);
  };

  // If the user clicked Export while a save was pending, start once it flushes.
  // "conflict" and "error" will never resolve to "saved" on their own — surface
  // them immediately instead of leaving the modal on "Saving your latest
  // changes…" forever.
  useEffect(() => {
    if (stage !== "waiting-save") return;
    if (saveState === "saved") startRender();
    else if (saveState === "conflict") {
      setError("This project was saved from another tab or device since you opened it. Reload the latest version from the editor before exporting.");
      setStage("error");
    } else if (saveState === "error") {
      setError("Your latest changes couldn't be saved, so we can't export yet. Check your connection and try again.");
      setStage("error");
    }
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
        if (res.status === 402) {
          insufficientCredits.open({ required: data.required, balance: data.balance, action: "Export" });
          setStage("confirm");
          return;
        }
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
            // Fired once, right on the export-complete screen — never
            // mid-render. lib/reviews/prompt-triggers.ts owns eligibility/
            // throttling; this only asks and shows the modal if it says yes.
            fireReviewPrompt("export_complete", { featureHint: "ai_video_editor" }).catch(() => { /* non-critical */ });
          } else if (project.status === "failed") {
            if (poll.current) clearInterval(poll.current);
            setError(
              project.failureReason
                ? `${project.failureReason} Your credit was refunded.`
                : "Render failed — your credit was refunded.",
            );
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
      close();
      insufficientCredits.open({ required: CREDIT_COST, balance: user?.credits ?? 0, action: "Export" });
      return;
    }
    if (saveState !== "saved") setStage("waiting-save");
    else startRender();
  };

  const duration = docDuration(doc);

  // ui/Modal gives this Esc, a focus trap, scroll lock and focus restore —
  // the hand-rolled overlay had none of them. It can't be dismissed while a
  // render is being started (the server is already charging for it).
  const busy = stage === "rendering" || stage === "waiting-save";

  return (
    <Modal open onClose={busy ? () => {} : close} title="Export video" maxWidth="max-w-md">
      {stage === "confirm" && (
        <>
          <div className="space-y-2 rounded-xl bg-surface-2 p-4 text-sm text-fg">
            <Row label="Aspect ratio" value={doc.aspect} />
            <Row label="Duration" value={`${Math.round(duration)}s`} />
            <Row label="Resolution" value={doc.aspect === "16:9" ? "1920×1080" : doc.aspect === "1:1" ? "1080×1080" : "1080×1920"} />
            <Row label="Cost" value={`${CREDIT_COST} credit`} />
            <Row label="Your balance" value={`${user?.credits ?? 0} credits`} />
          </div>
          <p className="mt-3 text-xs leading-snug text-fg-muted">
            Rendering happens on our servers — you can keep editing other projects while it runs. Preview and export
            are closely matched, though text rendering may differ by a pixel or two.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
            <Button type="button" onClick={onConfirm}>Export ({CREDIT_COST} credit)</Button>
          </div>
        </>
      )}

      {busy && (
        <div role="status" aria-live="polite">
          <p className="text-sm text-fg-muted">
            {stage === "waiting-save" ? "Saving your latest changes…" : "Rendering your video…"}
          </p>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label="Export progress"
          >
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.max(progress, 4)}%` }} />
          </div>
          <p className="mt-2 text-right text-xs text-fg-muted">{progress}%</p>
        </div>
      )}

      {stage === "done" && videoUrl && (
        <div>
          <p className="text-sm text-fg">Your video is ready 🎉</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close}>Close</Button>
            <a
              href={videoUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-full grad-brand px-5 py-2 text-sm font-semibold text-on-primary shadow-glow outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              Download MP4
            </a>
          </div>
        </div>
      )}

      {stage === "error" && (
        <div>
          <p role="alert" className="text-sm text-error">{error}</p>
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="secondary" onClick={close}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-fg-muted">{label}</span>
      <span className="font-semibold text-fg">{value}</span>
    </div>
  );
}
