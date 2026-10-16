"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useJobPolling } from "./useJobPolling";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { useUploadEntitlement } from "@/app/hooks/useUploadEntitlement";
import { AUDIO_RATE_LABEL } from "@/lib/audio-pricing";
import { Button } from "@/app/components/ui/Button";
import { ToolWorkspace, ToolBadge, ToolField, CostRow, FileDrop, Segmented, StageEmpty, StageProgress, RecentResults } from "@/app/components/tools/ToolWorkspace";





export default function EnhanceSpeechTool() {
  const { user, token, openAuthModal, refreshUser } = useAuth();
  const job = useJobPolling({ toolSlug: "enhance-speech", token });
  const fireReviewPrompt = useReviewPromptTrigger();
  const submittingRef = useRef(false);
  const downloadedForJobId = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("enhanced-audio.mp3");
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [compareView, setCompareView] = useState<"before" | "after">("after");
  const [pickError, setPickError] = useState<string | null>(null);
  const { maxBytes: uploadMaxBytes, formattedMaxSize: uploadMaxSizeLabel } = useUploadEntitlement("enhance-speech");

  const acceptFile = useCallback((f: File) => {
    // Mirrors the server's effective cap (app/api/tools/enhance-speech/route.ts,
    // via lib/upload-policy.ts) — gives instant feedback instead of only
    // finding out after a full upload.
    if (uploadMaxBytes != null && f.size > uploadMaxBytes) {
      setPickError(`File too large (max ${uploadMaxSizeLabel}).`);
      return;
    }
    setPickError(null);
    setFile(f);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    setOriginalUrl(URL.createObjectURL(f));
    setCompareView("after");
    job.reset();
    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); setDownloadUrl(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloadUrl, originalUrl, uploadMaxBytes, uploadMaxSizeLabel]);

  const removeFile = () => {
    setFile(null);
    if (originalUrl) { URL.revokeObjectURL(originalUrl); setOriginalUrl(null); }
    job.reset();
    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); setDownloadUrl(null); }
  };

  // Revoke the held object URL on unmount.
  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      if (originalUrl) URL.revokeObjectURL(originalUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!user || !token) { openAuthModal("login", "Enhance Speech"); return; }
    if (!file || job.status === "processing") return;
    if (submittingRef.current) return;
    submittingRef.current = true;

    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); setDownloadUrl(null); }
    const name = `enhanced-${file.name.replace(/\.[^.]+$/, "")}.mp3`;
    setDownloadName(name);

    const idempotencyKey = crypto.randomUUID();
    try {
      await job.start(async () => {
        const form = new FormData();
        form.append("file", file);
        form.append("idempotencyKey", idempotencyKey);

        const res = await fetch("/api/tools/enhance-speech", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Error ${res.status}`);
        }
        return (await res.json()) as { jobId: string };
      });
    } finally {
      submittingRef.current = false;
    }
  }, [user, token, openAuthModal, file, job, downloadUrl]);

  // Once the job is done, fetch the result and trigger a download.
  useEffect(() => {
    if (job.status !== "done" || !job.jobId || !token) return;
    if (downloadedForJobId.current === job.jobId) return;
    downloadedForJobId.current = job.jobId;
    fireReviewPrompt("tool_generation_complete", { featureHint: "ai_tools" }).catch(() => { /* non-critical */ });

    (async () => {
      try {
        const dlRes = await fetch(`/api/tools/enhance-speech?jobId=${job.jobId}&download=1`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!dlRes.ok) throw new Error("Download failed");

        const blob = await dlRes.blob();
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);

        const a = document.createElement("a");
        a.href = url;
        a.download = downloadName;
        a.click();

        await refreshUser();
      } catch {
        // The job itself succeeded; a failed download fetch just means the
        // user has to use "Download again" — no need to flip to an error state.
      }
    })();
  }, [job.status, job.jobId, token, downloadName, refreshUser, fireReviewPrompt]);

  const handleAgain = () => {
    setFile(null);
    if (originalUrl) { URL.revokeObjectURL(originalUrl); setOriginalUrl(null); }
    job.reset();
    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); setDownloadUrl(null); }
  };

  const busy = job.status === "processing";
  const done = job.status === "done" && !!downloadUrl;

  return (
    <ToolWorkspace
      title="AI Speech Enhancer"
      icon="sparkle"
      badges={<ToolBadge>{AUDIO_RATE_LABEL["enhance-speech"]}</ToolBadge>}
      description="Remove noise and echo so your voice sounds studio-clean."
      controls={
        <ToolField label="Recording" hint="up to 90 seconds">
          <FileDrop
            accept="audio/*,video/*"
            title="Click or drag audio or video here"
            hint={<>MP3, WAV, M4A, OGG, AAC, MP4, MOV, WEBM · up to {uploadMaxSizeLabel ?? "50 MB"}</>}
            file={file}
            onFile={acceptFile}
            onClear={busy || done ? undefined : removeFile}
            disabled={busy}
            inputLabel="Upload audio or video"
          />
          {pickError && <p role="alert" className="text-[12.5px] text-error">{pickError}</p>}
        </ToolField>
      }
      footer={
        <>
          {job.status === "error" && job.error && <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error">{job.error}</p>}
          {job.status === "cancelled" && <p className="text-sm text-fg-muted">Cancelled — your credits were refunded.</p>}
          <CostRow right={user ? `You have ${user.credits.toLocaleString()}` : undefined}>
            <span className="font-semibold text-fg">{AUDIO_RATE_LABEL["enhance-speech"]}</span> · minimum 1
          </CostRow>
          {!done ? (
            <Button type="button" className="w-full" onClick={() => void handleGenerate()} disabled={busy || !file} loading={busy}>
              {busy ? "Enhancing…" : "Enhance speech"}
            </Button>
          ) : (
            <Button type="button" className="w-full" variant="secondary" onClick={handleAgain}>Enhance another</Button>
          )}
        </>
      }
      stageTitle="Before / After"
      stageActions={
        done ? (
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Compare" value={compareView} onChange={setCompareView} options={[["before", "Before"], ["after", "After"]] as const} />
            <a href={downloadUrl!} download={downloadName} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-3">Download MP3</a>
          </div>
        ) : undefined
      }
      stage={
        busy ? (
          <StageProgress label="Enhancing…" progress={job.progress} onCancel={() => void job.cancel()} cancelLabel="Cancel" />
        ) : originalUrl && file ? (
          <div className="flex flex-1 flex-col gap-3">
            <div className={`flex flex-col gap-2 rounded-xl border p-4 ${!done || compareView === "before" ? "border-line bg-surface-1" : "border-line bg-surface-1 opacity-60"}`}>
              <p className="text-[12px] font-semibold text-fg-muted">Before · {file.name}</p>
              <audio src={originalUrl} controls className="w-full" />
            </div>
            <div className={`flex flex-col gap-2 rounded-xl border p-4 ${done ? (compareView === "after" ? "border-primary/50 bg-primary/5" : "border-line bg-surface-1 opacity-60") : "border-dashed border-line-strong bg-surface-1"}`}>
              <p className="text-[12px] font-semibold text-fg-muted">After · enhanced</p>
              {done ? <audio src={downloadUrl!} controls className="w-full" /> : <p className="text-[13px] text-fg-subtle">Press “Enhance speech” to hear the cleaned-up version here.</p>}
            </div>
            {done && <p className="text-[12px] text-fg-subtle">Downloaded and saved to your Assets</p>}
          </div>
        ) : (
          <StageEmpty icon="sparkle" title="Hear the difference here">
            Add a recording on the left. You can play the original and the enhanced version one after the other.
          </StageEmpty>
        )
      }
      below={user ? <RecentResults source="enhance-speech" refreshKey={downloadUrl} /> : undefined}
    />
  );
}
