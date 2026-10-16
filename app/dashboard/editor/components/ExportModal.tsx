"use client";

// Full-screen export page (redesign 2026-10): pre-export checks, then
// confirm credit cost → wait for autosave to flush → POST
// /api/editor/render → poll the project every 3s → download link.
// The server renders from the saved editorDoc in the DB, never from a client
// payload, so the "waiting for save" gate matters.

import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useEditorStore } from "../store/editorStore";
import { docDuration } from "@/lib/editor/doc-utils";
import { hasBlockingCheck, runExportChecks } from "@/lib/editor/export-checks";
import type { TrackKind } from "@/lib/editor/types";
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
  const select = useEditorStore((s) => s.select);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);

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
    if (hasBlockingCheck(runExportChecks(doc))) return;
    if ((user?.credits ?? 0) < CREDIT_COST) {
      close();
      insufficientCredits.open({ required: CREDIT_COST, balance: user?.credits ?? 0, action: "Export" });
      return;
    }
    if (saveState !== "saved") setStage("waiting-save");
    else startRender();
  };

  const duration = docDuration(doc);
  const checks = runExportChecks(doc);
  const blocked = hasBlockingCheck(checks);
  const resolution = doc.aspect === "16:9" ? "1920×1080" : doc.aspect === "1:1" ? "1080×1080" : "1080×1920";

  // Full-screen like the upgrade page (no drawers). It can't be dismissed while
  // a render is being started — the server is already charging for it.
  const busy = stage === "rendering" || stage === "waiting-save";
  const step = stage === "waiting-save" ? 0 : stage === "rendering" ? (progress >= 95 ? 2 : 1) : stage === "done" ? 3 : -1;

  const showMe = (at?: number, clip?: { track: TrackKind; id: string }) => {
    if (at != null) setCurrentTime(at);
    if (clip) select({ track: clip.track, clipId: clip.id });
    close();
  };

  return (
    <Modal open onClose={busy ? () => {} : close} title="Export" variant="fullscreen">
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* Left: what's going out, and what we checked */}
        <div className="flex flex-col gap-5">
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">What you&apos;re exporting</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Shape" value={doc.aspect} />
              <Stat label="Length" value={fmtLen(duration)} />
              <Stat label="Resolution" value={resolution} />
              <Stat label="Format" value="MP4" />
            </div>
          </section>
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Checked before export</p>
            <ul className="flex flex-col gap-2">
              {checks.map((c) => (
                <li key={c.id} className="flex items-start gap-3 rounded-xl border border-line bg-surface-1 px-3.5 py-2.5 text-[13.5px]">
                  <span aria-hidden="true" className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    c.level === "ok" ? "bg-success/15 text-success" : c.level === "block" ? "bg-error/15 text-error" : c.level === "warn" ? "bg-warning/15 text-warning" : "bg-surface-3 text-fg-muted"
                  }`}>{c.level === "ok" ? "✓" : c.level === "info" ? "i" : "!"}</span>
                  <span className="flex-1 text-fg">{c.message}</span>
                  {(c.at != null || c.clip) && !busy && (
                    <button type="button" onClick={() => showMe(c.at, c.clip)} className="flex-shrink-0 text-[12.5px] font-semibold text-primary hover:underline">Show me</button>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-fg-subtle">Warnings don&apos;t stop the export — they&apos;re things people often miss.</p>
          </section>
        </div>

        {/* Right: the action and its progress */}
        <aside className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5">
          {stage === "confirm" && (
            <>
              <h2 className="text-[20px] font-bold text-fg">Ready to export</h2>
              <p className="text-[13px] leading-relaxed text-fg-muted">
                Rendering happens on our servers — you can keep editing while it runs. Preview and export are closely matched, though text may differ by a pixel or two.
              </p>
              <div className="flex items-center justify-between rounded-xl border border-line bg-surface-1 px-3.5 py-2.5 text-[13px] text-fg-muted">
                <span><b className="text-fg">{CREDIT_COST} credit</b> · refunded if the render fails</span>
                <span className="text-fg-subtle">{(user?.credits ?? 0).toLocaleString()} left</span>
              </div>
              <Button type="button" onClick={onConfirm} disabled={blocked} className="w-full">Export video ({CREDIT_COST} credit)</Button>
              <Button type="button" variant="secondary" onClick={close} className="w-full">Back to editing</Button>
            </>
          )}

          {(busy || stage === "done") && (
            <>
              <h2 className="text-[20px] font-bold text-fg">{stage === "done" ? "Your video is ready" : "Rendering your video"}</h2>
              <div role="status" aria-live="polite" className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between text-[13px]">
                  <b className="text-[15px] text-fg">{stage === "done" ? 100 : progress}%</b>
                  <span className="text-fg-subtle">{stage === "waiting-save" ? "saving your latest changes" : stage === "done" ? "done" : "on our servers"}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stage === "done" ? 100 : progress} aria-label="Export progress">
                  <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${stage === "done" ? 100 : Math.max(progress, 4)}%` }} />
                </div>
                <ol className="flex flex-col gap-2 text-[13px]">
                  {["Saving your latest changes", `Rendering ${resolution}`, "Saving to your Assets"].map((label, i) => (
                    <li key={label} className={`flex items-center gap-2.5 ${i > step ? "text-fg-subtle" : "text-fg"}`}>
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${i < step ? "bg-success/15 text-success" : i === step ? "bg-primary text-on-primary" : "bg-surface-3 text-fg-subtle"}`}>{i < step ? "✓" : i + 1}</span>
                      {label}
                    </li>
                  ))}
                </ol>
              </div>
              {stage === "done" && videoUrl ? (
                <>
                  <a href={videoUrl} download target="_blank" rel="noopener noreferrer"
                     className="inline-flex w-full items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
                    Download MP4
                  </a>
                  <Button type="button" variant="secondary" onClick={close} className="w-full">Back to editing</Button>
                </>
              ) : (
                <p className="text-[12px] text-fg-subtle">Keep this open or come back later — the finished video is saved to your Assets either way.</p>
              )}
            </>
          )}

          {stage === "error" && (
            <>
              <h2 className="text-[20px] font-bold text-fg">Export didn&apos;t finish</h2>
              <p role="alert" className="text-sm text-error">{error}</p>
              <Button type="button" onClick={() => { setError(null); setStage("confirm"); }} className="w-full">Try again</Button>
              <Button type="button" variant="secondary" onClick={close} className="w-full">Back to editing</Button>
            </>
          )}
        </aside>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-1 px-3.5 py-3">
      <p className="text-[11.5px] text-fg-subtle">{label}</p>
      <p className="mt-0.5 text-[16px] font-semibold text-fg">{value}</p>
    </div>
  );
}

function fmtLen(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
