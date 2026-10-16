"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useJobPolling } from "@/app/components/useJobPolling";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { useUploadEntitlement } from "@/app/hooks/useUploadEntitlement";
import { subtitleRemoverCredits } from "@/lib/subtitle-remover-pricing";
import { ToolPlanGate, useToolAccess } from "@/app/components/ToolPlanGate";
import { Button } from "@/app/components/ui/Button";
import { ToolWorkspace, ToolBadge, ToolField, CostRow, FileDrop, OptionCards, Segmented, StageEmpty, StageProgress, RecentResults } from "@/app/components/tools/ToolWorkspace";

// Must match MAX_DURATION_SEC in app/api/tools/subtitle-remover/route.ts.
const MAX_DURATION_SEC = 10 * 60;

export default function SubtitleRemoverTool() {
  const { user, token, refreshUser, openAuthModal } = useAuth();
  const hasAccess = useToolAccess("pro");
  const { maxBytes: uploadMaxBytes, formattedMaxSize: uploadMaxSizeLabel } = useUploadEntitlement("subtitle-remover");
  // OCR of up to 90 frames plus a full re-encode can outlast the 10-minute default.
  const job = useJobPolling({ toolSlug: "subtitle-remover", token, maxDurationMs: 30 * 60 * 1000 });
  const fireReviewPrompt = useReviewPromptTrigger();

  const [file, setFile] = useState<File | null>(null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("subtitle-removed.mp4");
  const [compareView, setCompareView] = useState<"before" | "after">("after");
  // Where the captions sit. "bottom" leaves titles, logos and signs alone.
  const [area, setArea] = useState<"bottom" | "auto">("bottom");
  // Read from the file in the browser, so the price is known before running
  // (the route charges by the same length: 1 credit per 10 s, 2–20).
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const downloadedForJobId = useRef<string | null>(null);
  const submittingRef = useRef(false);

  const MAX_MB_LABEL = uploadMaxSizeLabel ?? "500 MB";

  const acceptFile = useCallback((f: File) => {
    if (!f.type.startsWith("video/")) {
      setErrorMsg("Please upload a video file (MP4, MOV, WEBM).");
      return;
    }
    if (uploadMaxBytes != null && f.size > uploadMaxBytes) {
      setErrorMsg(`File exceeds ${MAX_MB_LABEL} limit.`);
      return;
    }
    if (originalPreviewUrl) URL.revokeObjectURL(originalPreviewUrl);
    const url = URL.createObjectURL(f);
    setFile(f);
    setOriginalPreviewUrl(url);
    setDurationSec(null);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      const d = Number.isFinite(probe.duration) ? probe.duration : null;
      setDurationSec(d);
      if (d != null && d > MAX_DURATION_SEC) {
        setErrorMsg(`This video is ${Math.round(d / 60)} minutes long. Subtitle Remover handles up to ${MAX_DURATION_SEC / 60} minutes.`);
      }
    };
    probe.src = url;
    setErrorMsg("");
    setDownloadUrl(null);
    setCompareView("after");
    job.reset();
  }, [job, originalPreviewUrl, uploadMaxBytes, MAX_MB_LABEL]);

  const removeFile = () => {
    if (originalPreviewUrl) URL.revokeObjectURL(originalPreviewUrl);
    setFile(null);
    setOriginalPreviewUrl(null);
    setErrorMsg("");
    setDownloadUrl(null);
    job.reset();
  };

  // Revoke any held object URLs on unmount.
  useEffect(() => {
    return () => {
      if (originalPreviewUrl) URL.revokeObjectURL(originalPreviewUrl);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRemove = useCallback(async () => {
    if (!file || job.status === "processing") return;
    if (!user || !token) { openAuthModal("login", "Subtitle Remover"); return; }
    if (durationSec != null && durationSec > MAX_DURATION_SEC) return;
    if (submittingRef.current) return;
    submittingRef.current = true;

    setErrorMsg("");
    const name = `subtitle-removed-${file.name}`;
    setDownloadName(name);
    const idempotencyKey = crypto.randomUUID();

    try {
      await job.start(async () => {
        const form = new FormData();
        form.append("video", file);
        form.append("area", area);
        form.append("idempotencyKey", idempotencyKey);

        const res = await fetch("/api/tools/subtitle-remover", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(data.error ?? `Error ${res.status}`);
        }
        return (await res.json()) as { jobId: string };
      });
    } finally {
      submittingRef.current = false;
    }
  }, [file, job, user, token, openAuthModal, durationSec, area]);

  // Once the job is done, fetch and auto-download the result.
  useEffect(() => {
    if (job.status !== "done" || !job.jobId || !token) return;
    if (downloadedForJobId.current === job.jobId) return;
    downloadedForJobId.current = job.jobId;
    fireReviewPrompt("tool_generation_complete", { featureHint: "ai_tools" }).catch(() => { /* non-critical */ });

    (async () => {
      try {
        const dlRes = await fetch(`/api/tools/subtitle-remover?jobId=${job.jobId}&download=1`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!dlRes.ok) throw new Error("Download failed");
        const blob = await dlRes.blob();
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);

        const a = document.createElement("a");
        a.href = url;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        void refreshUser();
      } catch {
        // Job succeeded server-side; a failed download fetch just means the
        // user needs "Download again" rather than a hard error state.
      }
    })();
  }, [job.status, job.jobId, token, downloadName, refreshUser, fireReviewPrompt]);

  const handleAgain = () => {
    if (originalPreviewUrl) URL.revokeObjectURL(originalPreviewUrl);
    setFile(null);
    setOriginalPreviewUrl(null);
    setErrorMsg("");
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    job.reset();
  };

  const isComplete = job.status === "done";
  const busy = job.status === "processing";
  const fmtLen = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

  return (
    <ToolWorkspace
      title="Subtitle Remover"
      icon="subs"
      badges={<><ToolBadge tone="pro">Pro</ToolBadge><ToolBadge>2–20 credits</ToolBadge></>}
      description={`Blurs out burned-in captions so you can add your own. Videos up to ${MAX_DURATION_SEC / 60} minutes.`}
      controls={
        !hasAccess ? (
          <ToolPlanGate toolName="Subtitle Remover" minTier="pro" />
        ) : (
          <>
            <ToolField label="Video">
              <FileDrop
                accept="video/*"
                title="Click or drag a video here"
                hint={<>MP4, MOV, WEBM · up to {MAX_MB_LABEL} · {MAX_DURATION_SEC / 60} min</>}
                file={file}
                detail={durationSec != null ? fmtLen(durationSec) : undefined}
                onFile={acceptFile}
                onClear={busy || isComplete ? undefined : removeFile}
                disabled={busy}
                inputLabel="Upload a video"
              />
            </ToolField>
            {file && !isComplete && !busy && (
              <ToolField label="Where are the captions?">
                <OptionCards
                  name="caption-area"
                  value={area}
                  onChange={setArea}
                  options={[
                    ["bottom", "Bottom third", "Most videos — leaves titles and logos alone"],
                    ["auto", "Anywhere", "Blur any text the AI finds"],
                  ] as const}
                />
                <p className="text-[12px] text-fg-subtle">Captions are blurred rather than redrawn, so busy backgrounds may show a soft patch.</p>
              </ToolField>
            )}
          </>
        )
      }
      footer={
        hasAccess && (
          <>
            {(errorMsg || (job.status === "error" && job.error)) && (
              <div role="alert" className="flex items-center justify-between gap-2 rounded-lg bg-error/10 px-3 py-2 text-sm text-error">
                <span>{errorMsg || job.error}</span>
                {job.status === "error" && (
                  <button type="button" onClick={() => void handleRemove()} className="flex-shrink-0 text-xs font-semibold underline underline-offset-2">Retry</button>
                )}
              </div>
            )}
            {job.status === "cancelled" && <p className="text-sm text-fg-muted">Cancelled — your credits were refunded.</p>}
            {file && !isComplete && (
              <CostRow right={user ? `You have ${user.credits.toLocaleString()}` : undefined}>
                {durationSec != null
                  ? <>Costs <span className="font-semibold text-fg">{subtitleRemoverCredits(durationSec)} credits</span> · 1 per 10 s</>
                  : "Reading video length…"}
              </CostRow>
            )}
            {!isComplete ? (
              <Button type="button" className="w-full" loading={busy} onClick={() => void handleRemove()}
                      disabled={!file || busy || durationSec == null || durationSec > MAX_DURATION_SEC}>
                {busy ? "Removing…" : "Remove subtitles"}
              </Button>
            ) : (
              <Button type="button" className="w-full" variant="secondary" onClick={handleAgain}>Remove from another video</Button>
            )}
            <p className="text-center text-[12px] text-fg-subtle">No captions found? Your credits come back.</p>
          </>
        )
      }
      stageTitle="Preview"
      stageActions={
        isComplete && downloadUrl && job.meta?.regionsDetected !== 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Compare" value={compareView} onChange={setCompareView} options={[["before", "Before"], ["after", "After"]] as const} />
            <a href={downloadUrl} download={downloadName} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-3">Download again</a>
          </div>
        ) : undefined
      }
      stage={
        busy ? (
          <StageProgress label="Removing subtitles…" progress={job.progress} onCancel={() => void job.cancel()} cancelLabel="Cancel" />
        ) : isComplete && downloadUrl ? (
          job.meta?.regionsDetected === 0 ? (
            <StageEmpty icon="subs" title="No captions found">
              Nothing was found{area === "bottom" ? " in the bottom third" : ""}, so the video wasn&apos;t changed — your credits were refunded.
            </StageEmpty>
          ) : (
            <div className="flex flex-1 flex-col gap-2">
              {originalPreviewUrl && (
                <video key={compareView} src={compareView === "before" ? originalPreviewUrl : downloadUrl} controls
                       className="w-full flex-1 rounded-xl border border-line bg-black max-h-[620px]" />
              )}
              <p className="text-[12px] text-fg-subtle">
                {typeof job.meta?.regionsDetected === "number" ? `${job.meta.regionsDetected} text region${job.meta.regionsDetected === 1 ? "" : "s"} blurred · ` : ""}Downloaded and saved to your Assets
              </p>
            </div>
          )
        ) : originalPreviewUrl ? (
          <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-xl border border-line bg-black">
            <video src={originalPreviewUrl} controls className="max-h-[620px] w-full" />
            {area === "bottom" && (
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-[6%] bottom-[12%] h-[22%] rounded-lg border-2 border-dashed border-primary/80 bg-primary/5" />
            )}
            <span className="absolute left-3 top-3 rounded-md bg-black/70 px-2 py-1 text-[11px] text-white">
              {area === "bottom" ? "Dashed box: the area that gets cleaned" : "The whole frame is scanned"}
            </span>
          </div>
        ) : (
          <StageEmpty icon="subs" title="Your cleaned video appears here">
            Add a video on the left. You&apos;ll see the price before anything runs.
          </StageEmpty>
        )
      }
      below={user ? <RecentResults source="subtitle-remover" label="Recent cleanups" refreshKey={downloadUrl} /> : undefined}
    />
  );
}
