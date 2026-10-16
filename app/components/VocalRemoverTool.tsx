"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { useJobPolling } from "./useJobPolling";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { useUploadEntitlement } from "@/app/hooks/useUploadEntitlement";
import { AUDIO_RATE_LABEL } from "@/lib/audio-pricing";
import { Button } from "@/app/components/ui/Button";
import { ToolWorkspace, ToolBadge, ToolField, CostRow, FileDrop, StageEmpty, StageProgress, RecentResults } from "@/app/components/tools/ToolWorkspace";

// ── Icons ─────────────────────────────────────────────────────────────────────



function IcDownload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}


export default function VocalRemoverTool() {
  const { user, token, openAuthModal, refreshUser } = useAuth();
  const job = useJobPolling({ toolSlug: "vocal-remover", token });
  const fireReviewPrompt = useReviewPromptTrigger();
  const submittingRef = useRef(false);
  const downloadedForJobId = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("instrumental.mp3");
  const [pickError, setPickError] = useState<string | null>(null);
  const { maxBytes: uploadMaxBytes, formattedMaxSize: uploadMaxSizeLabel } = useUploadEntitlement("vocal-remover");

  const acceptFile = useCallback((f: File) => {
    // Mirrors the server's effective cap (app/api/tools/vocal-remover/route.ts,
    // via lib/upload-policy.ts) — gives instant feedback instead of only
    // finding out after a full upload.
    if (uploadMaxBytes != null && f.size > uploadMaxBytes) {
      setPickError(`File too large (max ${uploadMaxSizeLabel}).`);
      return;
    }
    setPickError(null);
    setFile(f);
    job.reset();
    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); setDownloadUrl(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloadUrl, uploadMaxBytes, uploadMaxSizeLabel]);

  const removeFile = () => {
    setFile(null);
    job.reset();
    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); setDownloadUrl(null); }
  };

  // Revoke the held object URL on unmount.
  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRemove = useCallback(async () => {
    if (!user || !token) { openAuthModal("login", "AI Vocal Remover"); return; }
    if (!file || job.status === "processing") return;
    if (submittingRef.current) return;
    submittingRef.current = true;

    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); setDownloadUrl(null); }
    const name = `instrumental-${file.name.replace(/\.[^.]+$/, "")}.mp3`;
    setDownloadName(name);

    const idempotencyKey = crypto.randomUUID();
    try {
      await job.start(async () => {
        const form = new FormData();
        form.append("file", file);
        form.append("idempotencyKey", idempotencyKey);

        const res = await fetch("/api/tools/vocal-remover", {
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
        const dlRes = await fetch(`/api/tools/vocal-remover?jobId=${job.jobId}&download=1`, {
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
        // user has to use the download link — no need to flip to an error state.
      }
    })();
  }, [job.status, job.jobId, token, downloadName, refreshUser, fireReviewPrompt]);

  const handleAgain = () => {
    setFile(null);
    job.reset();
    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); setDownloadUrl(null); }
  };

  const busy = job.status === "processing";
  const done = job.status === "done" && !!downloadUrl;
  const vocalsUrl = typeof job.meta?.vocalsUrl === "string" ? job.meta.vocalsUrl : null;

  return (
    <ToolWorkspace
      title="AI Vocal Remover"
      icon="music"
      badges={<ToolBadge>{AUDIO_RATE_LABEL["vocal-remover"]}</ToolBadge>}
      description="Split a song into the music and the vocals."
      controls={
        <ToolField label="Song" hint="up to 5 minutes">
          <FileDrop
            accept="audio/*,video/*"
            title="Click or drag audio or video here"
            hint={<>MP3, WAV, OGG, FLAC, M4A, AAC, MP4, MOV, WEBM · up to {uploadMaxSizeLabel ?? "50 MB"}</>}
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
            <span className="font-semibold text-fg">{AUDIO_RATE_LABEL["vocal-remover"]}</span> · minimum 1
          </CostRow>
          {!done ? (
            <Button type="button" className="w-full" onClick={() => void handleRemove()} disabled={busy || !file} loading={busy}>
              {busy ? "Removing vocals…" : "Split song"}
            </Button>
          ) : (
            <Button type="button" className="w-full" variant="secondary" onClick={handleAgain}>Split another song</Button>
          )}
          <p className="text-center text-[12px] text-fg-subtle">Both tracks are saved to your Assets.</p>
        </>
      }
      stageTitle="Tracks"
      stage={
        busy ? (
          <StageProgress label="Removing vocals…" progress={job.progress} onCancel={() => void job.cancel()} cancelLabel="Cancel" />
        ) : done ? (
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex flex-col gap-2 rounded-xl border border-primary/50 bg-primary/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="text-[14px] text-fg">Instrumental</b>
                <a href={downloadUrl!} download={downloadName} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-3"><IcDownload /> MP3</a>
              </div>
              <audio src={downloadUrl!} controls className="w-full" />
            </div>
            {vocalsUrl && (
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-1 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className="text-[14px] text-fg">Vocals only</b>
                  <a href={vocalsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-3"><IcDownload /> MP3</a>
                </div>
                <audio src={vocalsUrl} controls className="w-full" />
              </div>
            )}
          </div>
        ) : (
          <StageEmpty icon="music" title="Your two tracks appear here">
            Add a song on the left. You get the instrumental and the vocals as separate files.
          </StageEmpty>
        )
      }
      below={user ? <RecentResults source="vocal-remover" label="Recent splits" refreshKey={downloadUrl} /> : undefined}
    />
  );
}
