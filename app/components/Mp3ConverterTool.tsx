"use client";
import { useCallback, useRef, useState, useEffect } from "react";
import { useJobPolling } from "./useJobPolling";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { useUploadEntitlement } from "@/app/hooks/useUploadEntitlement";
import { useAuth } from "@/app/components/AuthContext";
import { Button } from "@/app/components/ui/Button";
import { ToolWorkspace, ToolBadge, ToolField, CostRow, FileDrop, OptionCards, StageEmpty, StageProgress } from "@/app/components/tools/ToolWorkspace";

interface QualityOption {
  id: string;
  label: string;
  sub: string;
}

const QUALITY_OPTIONS: QualityOption[] = [
  { id: "minimum", label: "64 kbps", sub: "Smallest file" },
  { id: "low", label: "128 kbps", sub: "Speech" },
  { id: "medium", label: "192 kbps", sub: "Recommended" },
  { id: "high", label: "256 kbps", sub: "Music" },
  { id: "maximum", label: "320 kbps", sub: "Best quality" },
];

function fmtMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}


// ── Icons ──────────────────────────────────────────────────────────────────
function IcDownload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

export default function Mp3ConverterTool() {
  const job = useJobPolling({ toolSlug: "mp3-converter", token: null, requireAuth: false });
  const fireReviewPrompt = useReviewPromptTrigger();
  const { formattedMaxSize: uploadMaxSizeLabel } = useUploadEntitlement("mp3-converter");
  // Sent with the upload so the route applies this user's plan cap — without
  // it every caller counted as anonymous (lib/upload-policy ANONYMOUS_MAX_BYTES).
  const { token } = useAuth();
  const submittingRef = useRef(false);
  const downloadedForJobId = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState("medium");
  const [realtime, setRealtime] = useState(0);

  const [durationSec, setDurationSec] = useState(0);
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  const startTimeRef = useRef(0);

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

  function onPick(list: FileList | File[] | null) {
    if (!list || list.length === 0) return;
    const f = list[0];
    setFile(f);
    job.reset();
    setOutputBlob(null);
    if (outputUrl) { URL.revokeObjectURL(outputUrl); setOutputUrl(null); }
    // Read real media duration so the "real-time" multiplier is grounded.
    const url = URL.createObjectURL(f);
    const media = document.createElement("video");
    media.preload = "metadata";
    media.onloadedmetadata = () => {
      setDurationSec(Number.isFinite(media.duration) ? media.duration : 0);
      URL.revokeObjectURL(url);
    };
    media.onerror = () => { setDurationSec(0); URL.revokeObjectURL(url); };
    media.src = url;
  }

  function clearFile() {
    setFile(null);
    job.reset();
    setOutputBlob(null);
    if (outputUrl) { URL.revokeObjectURL(outputUrl); setOutputUrl(null); }
  }

  const handleConvert = useCallback(async () => {
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
        const startRes = await fetch("/api/tools/mp3-converter", {
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
  }, [file, quality, job, token]);

  // Once the job is done, fetch the converted file.
  useEffect(() => {
    if (job.status !== "done" || !job.jobId) return;
    if (downloadedForJobId.current === job.jobId) return;
    downloadedForJobId.current = job.jobId;
    fireReviewPrompt("tool_generation_complete", { featureHint: "ai_tools" }).catch(() => { /* non-critical */ });

    (async () => {
      try {
        const fileRes = await fetch(`/api/tools/mp3-converter?jobId=${job.jobId}&download=1`);
        if (!fileRes.ok) throw new Error("Failed to fetch converted file");
        const blob = await fileRes.blob();
        const url = URL.createObjectURL(blob);
        setOutputBlob(blob);
        setOutputUrl(url);
      } catch {
        // Leave stage at "done" with no output — user can hit "Convert Again".
      }
    })();
  }, [job.status, job.jobId, fireReviewPrompt]);

  function handleDownload() {
    if (!outputUrl || !file) return;
    const base = file.name.replace(/\.[^.]+$/, "");
    const a = document.createElement("a");
    a.href = outputUrl;
    a.download = `${base}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function convertAgain() {
    job.reset();
    setOutputBlob(null);
    if (outputUrl) { URL.revokeObjectURL(outputUrl); setOutputUrl(null); }
  }

  const stage = file ? (job.status === "idle" ? "ready" : job.status) : "idle";
  const canSubmit = stage === "ready" || stage === "error";
  const busy = stage === "processing";
  // Quality is locked once conversion starts and stays locked on the result screen.
  const qualityLocked = stage === "processing" || stage === "done";
  const qualityLabel = QUALITY_OPTIONS.find(q => q.id === quality)?.label ?? quality;

  return (
    <ToolWorkspace
      title="MP3 Converter"
      icon="note"
      badges={<ToolBadge tone="free">Free</ToolBadge>}
      description="Pull the audio out of any video, or re-save audio as MP3."
      controls={
        <>
          <ToolField label="Video or audio">
            <FileDrop
              accept="audio/*,video/*"
              title="Click or drag a file here"
              hint={<>MP3, WAV, AAC, MP4, MOV, MKV, WEBM · up to {uploadMaxSizeLabel ?? "500 MB"}</>}
              file={file}
              onFile={(f) => onPick([f])}
              onClear={busy ? undefined : clearFile}
              disabled={busy}
              inputLabel="Upload audio or video"
            />
          </ToolField>
          <ToolField label="Quality" hint="higher means bigger files">
            <OptionCards
              name="mp3-quality"
              value={quality}
              onChange={setQuality}
              disabled={qualityLocked}
              columns={1}
              options={QUALITY_OPTIONS.map(q => [q.id, q.label, q.sub] as const)}
            />
          </ToolField>
        </>
      }
      footer={
        <>
          {stage === "error" && job.error && <p role="alert" className="text-sm text-error">{job.error}</p>}
          <CostRow right={qualityLabel}><span className="font-semibold text-fg">Free</span></CostRow>
          {stage === "done" ? (
            <Button type="button" className="w-full" variant="secondary" onClick={convertAgain}>Convert again</Button>
          ) : (
            <Button type="button" className="w-full" onClick={() => void handleConvert()} disabled={!canSubmit} loading={busy}>
              {busy ? "Converting…" : "Convert to MP3"}
            </Button>
          )}
        </>
      }
      stageActions={
        stage === "done" && outputUrl ? (
          <Button type="button" size="sm" onClick={handleDownload}><span className="inline-flex items-center gap-2"><IcDownload /> Download MP3</span></Button>
        ) : undefined
      }
      stage={
        busy ? (
          <StageProgress label={`Converting at ${qualityLabel}${realtime > 0 ? ` · about ${realtime.toFixed(1)}× real time` : ""}…`} progress={job.progress} />
        ) : stage === "done" && file && outputUrl ? (
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex flex-col gap-2 rounded-xl border border-primary/50 bg-primary/5 p-4">
              <p className="text-[12px] font-semibold text-fg-muted">{file.name.replace(/\.[^.]+$/, "")}.mp3 · {qualityLabel}</p>
              <audio src={outputUrl} controls className="w-full" />
            </div>
            {outputBlob && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-line bg-surface-1 p-4"><p className="text-[12px] text-fg-subtle">Original</p><p className="text-[22px] font-semibold text-fg">{fmtMB(file.size)}</p></div>
                <div className="rounded-xl border border-line bg-surface-1 p-4"><p className="text-[12px] text-fg-subtle">MP3</p><p className="text-[22px] font-semibold text-fg">{fmtMB(outputBlob.size)}</p></div>
              </div>
            )}
          </div>
        ) : (
          <StageEmpty icon="note" title="Your MP3 appears here">
            Add a file on the left and pick a quality. 192 kbps is right for most music.
          </StageEmpty>
        )
      }
    />
  );
}
