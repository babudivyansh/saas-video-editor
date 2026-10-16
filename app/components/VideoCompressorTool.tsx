"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { useJobPolling } from "./useJobPolling";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { useUploadEntitlement } from "@/app/hooks/useUploadEntitlement";
import { useAuth } from "@/app/components/AuthContext";
import { useModKey } from "./useModKey";
import { Button } from "@/app/components/ui/Button";
import { ToolWorkspace, ToolBadge, ToolField, CostRow, FileDrop, OptionCards, StageEmpty, StageProgress } from "@/app/components/tools/ToolWorkspace";

interface QualityOption {
  id: string;
  label: string;
  sub: string;
}

interface ResolutionOption {
  id: string;
  label: string;
  w: number;
  h: number;
}

// Ordered smallest file → best quality. The ids are the route's compression
// strengths (lib: QUALITY_CRF); the old labels ("Maximum" … "Minimal") named
// the compression, so "Low" read as low quality when it meant high.
const QUALITY_OPTIONS: QualityOption[] = [
  { id: "maximum", label: "Smallest file", sub: "Most compression" },
  { id: "high", label: "Small", sub: "Good for sharing" },
  { id: "medium", label: "Balanced", sub: "Recommended" },
  { id: "low", label: "High quality", sub: "Larger file" },
  { id: "minimal", label: "Best quality", sub: "Largest file" },
];

const RESOLUTION_TARGETS = [
  { id: "1080p", label: "1080p", targetH: 1080 },
  { id: "720p", label: "720p", targetH: 720 },
  { id: "480p", label: "480p", targetH: 480 },
  { id: "360p", label: "360p", targetH: 360 },
  { id: "240p", label: "240p", targetH: 240 },
];

function getResolutionOptions(w: number, h: number): ResolutionOption[] {
  const opts: ResolutionOption[] = [{ id: "original", label: "Original", w, h }];
  for (const t of RESOLUTION_TARGETS) {
    if (h > t.targetH) {
      opts.push({ id: t.id, label: t.label, w: Math.round(w * t.targetH / h), h: t.targetH });
    }
  }
  return opts;
}

function fmtMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}


function IcDownload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

export default function VideoCompressorTool() {
  const job = useJobPolling({ toolSlug: "video-compressor", token: null, requireAuth: false, maxDurationMs: 30 * 60 * 1000 });
  const fireReviewPrompt = useReviewPromptTrigger();
  const { formattedMaxSize: uploadMaxSizeLabel } = useUploadEntitlement("video-compressor");
  // Sent with the upload so the route applies this user's plan cap — without
  // it every caller counted as anonymous (lib/upload-policy ANONYMOUS_MAX_BYTES).
  const { token } = useAuth();
  const modKey = useModKey();
  const submittingRef = useRef(false);
  const downloadedForJobId = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState("medium");
  const [resolution, setResolution] = useState("original");
  const [videoDims, setVideoDims] = useState({ w: 0, h: 0 });
  const [realtime, setRealtime] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  const startTimeRef = useRef(0);

  const resolutionOptions = videoDims.h > 0 ? getResolutionOptions(videoDims.w, videoDims.h) : [];

  useEffect(() => {
    return () => {
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time-multiple estimate, recomputed whenever the poll loop reports
  // fresh progress.
  useEffect(() => {
    if (job.status !== "processing") return;
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    if (durationSec > 0 && elapsed > 0) {
      setRealtime((durationSec * (job.progress / 100)) / elapsed);
    }
  }, [job.progress, job.status, durationSec]);

  const handleCompress = useCallback(async () => {
    if (!file || job.status === "processing") return;
    if (submittingRef.current) return;
    submittingRef.current = true;

    setRealtime(0);
    startTimeRef.current = Date.now();
    try {
      await job.start(async () => {
        const form = new FormData();
        form.append("file", file);
        form.append("quality", quality);
        form.append("resolution", resolution);
        const startRes = await fetch("/api/tools/video-compressor", {
          method: "POST",
          body: form,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!startRes.ok) {
          const json = await startRes.json().catch(() => ({})) as { error?: string };
          throw new Error(json.error ?? `Server error (${startRes.status})`);
        }
        return (await startRes.json()) as { jobId: string };
      });
    } finally {
      submittingRef.current = false;
    }
  }, [file, quality, resolution, job, token]);

  const stage = file ? (job.status === "idle" ? "ready" : job.status) : "idle";

  // ⌘+Enter / Ctrl+Enter shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && stage === "ready") {
        void handleCompress();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, handleCompress]);

  // Once the job is done, fetch the compressed file.
  useEffect(() => {
    if (job.status !== "done" || !job.jobId) return;
    if (downloadedForJobId.current === job.jobId) return;
    downloadedForJobId.current = job.jobId;
    fireReviewPrompt("tool_generation_complete", { featureHint: "ai_tools" }).catch(() => { /* non-critical */ });

    (async () => {
      try {
        const fileRes = await fetch(`/api/tools/video-compressor?jobId=${job.jobId}&download=1`);
        if (!fileRes.ok) throw new Error("Failed to fetch compressed file");
        const blob = await fileRes.blob();
        const url = URL.createObjectURL(blob);
        setOutputBlob(blob);
        setOutputUrl(url);
      } catch {
        // Leave stage at "done" with no output — user can hit "Compress Again".
      }
    })();
  }, [job.status, job.jobId, fireReviewPrompt]);

  function onPick(list: FileList | File[] | null) {
    if (!list || list.length === 0) return;
    const f = list[0];
    setFile(f);
    job.reset();
    setOutputBlob(null);
    if (outputUrl) { URL.revokeObjectURL(outputUrl); setOutputUrl(null); }
    setResolution("original");
    const url = URL.createObjectURL(f);
    const media = document.createElement("video");
    media.preload = "metadata";
    media.onloadedmetadata = () => {
      setDurationSec(Number.isFinite(media.duration) ? media.duration : 0);
      setVideoDims({ w: media.videoWidth, h: media.videoHeight });
      URL.revokeObjectURL(url);
    };
    media.onerror = () => { setDurationSec(0); URL.revokeObjectURL(url); };
    media.src = url;
  }

  function clearFile() {
    setFile(null);
    job.reset();
    setOutputBlob(null);
    setVideoDims({ w: 0, h: 0 });
    if (outputUrl) { URL.revokeObjectURL(outputUrl); setOutputUrl(null); }
  }

  function handleDownload() {
    if (!outputUrl || !file) return;
    const base = file.name.replace(/\.[^.]+$/, "");
    const a = document.createElement("a");
    a.href = outputUrl;
    a.download = `${base}-compressed.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function compressAgain() {
    job.reset();
    setOutputBlob(null);
    if (outputUrl) { URL.revokeObjectURL(outputUrl); setOutputUrl(null); }
  }

  const canSubmit = stage === "ready" || stage === "error";
  const busy = stage === "processing";
  const locked = stage === "processing" || stage === "done";
  const qualityLabel = QUALITY_OPTIONS.find(q => q.id === quality)?.label ?? quality;

  return (
    <ToolWorkspace
      title="Video Compressor"
      icon="compress"
      badges={<ToolBadge tone="free">Free</ToolBadge>}
      description="Shrink a video so it uploads and sends faster."
      controls={
        <>
          <ToolField label="Video">
            <FileDrop
              accept="video/*"
              title="Click or drag a video here"
              hint={<>MP4, MOV, MKV, WEBM, AVI · up to {uploadMaxSizeLabel ?? "500 MB"}</>}
              file={file}
              detail={videoDims.h > 0 ? `${videoDims.w}×${videoDims.h}` : undefined}
              onFile={(f) => onPick([f])}
              onClear={busy ? undefined : clearFile}
              disabled={busy}
              inputLabel="Upload a video"
            />
          </ToolField>
          <ToolField label="File size vs quality">
            <OptionCards
              name="compress-quality"
              value={quality}
              onChange={setQuality}
              disabled={locked}
              columns={1}
              options={QUALITY_OPTIONS.map(q => [q.id, q.label, q.sub] as const)}
            />
          </ToolField>
          {resolutionOptions.length > 1 && (
            <ToolField label="Resolution">
              <div role="radiogroup" aria-label="Resolution" className="flex flex-wrap gap-2">
                {resolutionOptions.map(r => (
                  <label key={r.id} className={`cursor-pointer rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${resolution === r.id ? "border-primary/60 bg-primary/10 text-fg" : "border-line text-fg-muted hover:text-fg"} ${locked ? "pointer-events-none opacity-60" : ""}`}>
                    <input type="radio" name="resolution" value={r.id} checked={resolution === r.id} onChange={() => setResolution(r.id)} disabled={locked} className="sr-only" />
                    {r.label}{r.id === "original" ? ` · ${r.w}×${r.h}` : ""}
                  </label>
                ))}
              </div>
            </ToolField>
          )}
        </>
      }
      footer={
        <>
          {stage === "error" && job.error && <p role="alert" className="text-sm text-error">{job.error}</p>}
          <CostRow right="MP4 output"><span className="font-semibold text-fg">Free</span></CostRow>
          {stage === "done" ? (
            <Button type="button" className="w-full" variant="secondary" onClick={compressAgain}>Compress again</Button>
          ) : (
            <Button type="button" className="w-full" onClick={() => void handleCompress()} disabled={!canSubmit} loading={busy}>
              {busy ? "Compressing…" : <>Compress video <kbd className="ml-1 hidden rounded bg-black/15 px-1.5 py-0.5 text-[11px] font-semibold sm:inline-block">{modKey}+Enter</kbd></>}
            </Button>
          )}
        </>
      }
      stageActions={
        stage === "done" && outputUrl ? (
          <Button type="button" size="sm" onClick={handleDownload}><span className="inline-flex items-center gap-2"><IcDownload /> Download MP4</span></Button>
        ) : undefined
      }
      stage={
        busy ? (
          <StageProgress label={`Compressing · ${qualityLabel}${realtime > 0 ? ` · about ${realtime.toFixed(1)}× real time` : ""}…`} progress={job.progress} />
        ) : stage === "done" && file && outputUrl && outputBlob ? (
          <div className="flex flex-1 flex-col gap-3">
            <video src={outputUrl} controls className="max-h-[440px] w-full rounded-xl border border-line bg-black" />
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line bg-surface-1 p-4"><p className="text-[12px] text-fg-subtle">Before</p><p className="text-[26px] font-semibold tracking-tight text-fg">{fmtMB(file.size)}</p></div>
              <div className="rounded-xl border border-primary/50 bg-primary/5 p-4">
                <p className="text-[12px] text-fg-subtle">After</p>
                <p className="text-[26px] font-semibold tracking-tight text-fg">{fmtMB(outputBlob.size)}</p>
                {outputBlob.size < file.size && (
                  <p className="text-[12.5px] font-semibold text-success">{Math.round((1 - outputBlob.size / file.size) * 100)}% smaller</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <StageEmpty icon="compress" title="Your smaller video appears here">
            Add a video on the left. You&apos;ll see the size before and after.
          </StageEmpty>
        )
      }
    />
  );
}
