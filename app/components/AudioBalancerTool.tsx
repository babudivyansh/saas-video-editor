"use client";
import { useCallback, useRef, useState, useEffect } from "react";
import { useJobPolling } from "./useJobPolling";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { useUploadEntitlement } from "@/app/hooks/useUploadEntitlement";

interface BalanceMode {
  id: string;
  label: string;
  sub: string;
}

const BALANCE_MODES: BalanceMode[] = [
  { id: "left-only", label: "Left Only", sub: "Keep left, mute right" },
  { id: "balance-center", label: "Balance Center", sub: "Auto-balance channels" },
  { id: "right-only", label: "Right Only", sub: "Keep right, mute left" },
];

function fmtMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function truncate(name: string, max = 40): string {
  return name.length > max ? name.slice(0, max) + "…" : name;
}

function IcCloud() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
    </svg>
  );
}
function IcMusic({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
    </svg>
  );
}
function IcCheck({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" /><path d="M9 12l2 2 4-4" />
    </svg>
  );
}
function IcDoc() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" />
    </svg>
  );
}
function IcX() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
function IcDownload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}
function Spinner() {
  return (
    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function AudioBalancerTool() {
  const inputRef = useRef<HTMLInputElement>(null);
  const job = useJobPolling({ toolSlug: "audio-balancer", token: null, requireAuth: false });
  const fireReviewPrompt = useReviewPromptTrigger();
  const { formattedMaxSize: uploadMaxSizeLabel } = useUploadEntitlement("audio-balancer");
  const submittingRef = useRef(false);
  const downloadedForJobId = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [balanceMode, setBalanceMode] = useState("balance-center");
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

  function onPick(list: FileList | null) {
    if (!list || list.length === 0) return;
    const f = list[0];
    setFile(f);
    job.reset();
    setOutputBlob(null);
    if (outputUrl) { URL.revokeObjectURL(outputUrl); setOutputUrl(null); }
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

  const handleBalance = useCallback(async () => {
    if (!file || job.status === "processing") return;
    if (submittingRef.current) return;
    submittingRef.current = true;

    setRealtime(0);
    startTimeRef.current = Date.now();
    try {
      await job.start(async () => {
        const form = new FormData();
        form.append("file", file);
        form.append("mode", balanceMode);
        const startRes = await fetch("/api/tools/audio-balancer", { method: "POST", body: form });
        if (!startRes.ok) {
          const json = await startRes.json().catch(() => ({})) as { error?: string };
          throw new Error(json.error ?? `Server error (${startRes.status})`);
        }
        return (await startRes.json()) as { jobId: string };
      });
    } finally {
      submittingRef.current = false;
    }
  }, [file, balanceMode, job]);

  // Once the job is done, fetch the balanced file.
  useEffect(() => {
    if (job.status !== "done" || !job.jobId) return;
    if (downloadedForJobId.current === job.jobId) return;
    downloadedForJobId.current = job.jobId;
    fireReviewPrompt("tool_generation_complete", { featureHint: "ai_tools" }).catch(() => { /* non-critical */ });

    (async () => {
      try {
        const fileRes = await fetch(`/api/tools/audio-balancer?jobId=${job.jobId}&download=1`);
        if (!fileRes.ok) throw new Error("Failed to fetch balanced file");
        const blob = await fileRes.blob();
        const url = URL.createObjectURL(blob);
        setOutputBlob(blob);
        setOutputUrl(url);
      } catch {
        // Leave stage at "done" with no output — user can hit "Balance Again".
      }
    })();
  }, [job.status, job.jobId, fireReviewPrompt]);

  function handleDownload() {
    if (!outputUrl || !file) return;
    const base = file.name.replace(/\.[^.]+$/, "");
    const a = document.createElement("a");
    a.href = outputUrl;
    a.download = `${base}-balanced.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function balanceAgain() {
    job.reset();
    setOutputBlob(null);
    if (outputUrl) { URL.revokeObjectURL(outputUrl); setOutputUrl(null); }
  }

  const stage = file ? (job.status === "idle" ? "ready" : job.status) : "idle";
  const canSubmit = stage === "ready" || stage === "error";
  const busy = stage === "processing";
  const modeLocked = stage === "processing" || stage === "done";
  const modeLabel = BALANCE_MODES.find(m => m.id === balanceMode)?.label ?? balanceMode;
  const fileType = file?.type.startsWith("audio/") ? "Audio" : "Video";

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 md:px-8 pb-10">
      <div className="rounded-[28px] bg-surface-2 border border-line flex items-center justify-center p-4 md:p-8" style={{ minHeight: "calc(100vh - 132px)" }}>
        <div className="w-full max-w-[560px] bg-panel rounded-2xl border border-line shadow-sm p-5">

          {/* Header */}
          <div className="flex items-start gap-3 pb-4 border-b border-line">
            <div className="w-11 h-11 rounded-full border border-line flex items-center justify-center text-fg-muted flex-shrink-0">
              <IcMusic />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-fg text-[17px] leading-tight">Balance Audio</h2>
              <p className="text-sm text-fg-muted mt-1">Upload an audio or video file to normalize and balance audio.</p>
            </div>
          </div>

          {/* Dropzone (idle only) */}
          {stage === "idle" && (
            <>
              <input ref={inputRef} type="file" accept="audio/*,video/*" className="hidden" onChange={e => onPick(e.target.files)} />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); onPick(e.dataTransfer.files); }}
                className="mt-4 w-full rounded-xl border transition-colors flex flex-col items-center justify-center text-center px-6 py-10"
                style={{ borderColor: dragging ? "var(--primary)" : "var(--line)", background: dragging ? "var(--tint-emerald)" : "var(--surface-2)" }}
              >
                <div className="w-12 h-12 rounded-full bg-surface-2 border border-line flex items-center justify-center text-fg-subtle mb-3">
                  <IcCloud />
                </div>
                <p className="text-[15px] font-semibold text-fg">Upload audio or video</p>
                <p className="text-sm text-fg-subtle mt-1">Drag and drop or click to browse</p>
                <p className="text-xs text-fg-subtle mt-2">.mp3, .wav, .aac, .ogg, .flac, .mp4, .mov, .mkv • Max {uploadMaxSizeLabel ?? "500 MB"}</p>
              </button>
            </>
          )}

          {/* Uploaded file card */}
          {stage !== "idle" && file && (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-3">
              <span className="text-success flex-shrink-0"><IcCheck /></span>
              <span className="w-8 h-8 rounded-lg bg-panel border border-green-200 flex items-center justify-center text-fg-muted flex-shrink-0"><IcDoc /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-fg truncate">{truncate(file.name)}</p>
                <p className="text-xs text-fg-muted mt-0.5">{fmtMB(file.size)} • Uploaded successfully</p>
              </div>
              {!busy && (
                <button type="button" onClick={clearFile} className="text-fg-subtle hover:text-fg-muted flex-shrink-0">
                  <IcX />
                </button>
              )}
            </div>
          )}

          {/* Balance Mode selector */}
          {stage !== "idle" && (
            <div className="mt-5">
              <p className="text-sm font-semibold text-fg mb-2">Balance Mode</p>
              <div className="grid grid-cols-3 gap-2">
                {BALANCE_MODES.map(opt => {
                  const active = balanceMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={modeLocked}
                      onClick={() => setBalanceMode(opt.id)}
                      className="rounded-lg border px-1 py-3 text-center transition-colors"
                      style={{
                        borderColor: active ? "var(--primary)" : "var(--line)",
                        background: active ? "var(--tint-emerald)" : "var(--surface-2)",
                        opacity: modeLocked && !active ? 0.5 : 1,
                        cursor: modeLocked ? "not-allowed" : "pointer",
                      }}
                    >
                      <p className="text-[13px] font-semibold" style={{ color: active ? "var(--brand-deep)" : "var(--fg-muted)" }}>{opt.label}</p>
                      <p className="text-[11px] text-fg-subtle leading-tight mt-0.5">{opt.sub}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {stage === "error" && job.error && <p className="mt-3 text-sm text-error text-center">{job.error}</p>}

          {/* Balancing progress */}
          {stage === "processing" && (
            <div className="mt-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-fg-muted">Balancing audio levels…</span>
                {realtime > 0 && <span className="text-fg-subtle">~{realtime.toFixed(1)}x real time</span>}
              </div>
              <div className="mt-2 h-2 rounded-full bg-surface-3 overflow-hidden">
                <div className="h-full bg-brand transition-all duration-150" style={{ width: `${job.progress}%` }} />
              </div>
              <p className="text-xs text-fg-muted mt-1">{Math.round(job.progress)}% complete</p>
            </div>
          )}

          {/* Complete panel */}
          {stage === "done" && file && outputBlob && (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <div className="flex items-center gap-2 text-green-700 font-semibold">
                <IcCheck className="w-5 h-5" /> Balance Complete
              </div>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-fg-muted">Original size:</span>
                  <span className="font-medium text-fg">{fmtMB(file.size)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-fg-muted">Output size:</span>
                  <span className="font-medium text-fg">{fmtMB(outputBlob.size)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium" style={{ color: "var(--brand-deep)" }}>Balance mode:</span>
                  <span className="font-semibold" style={{ color: "var(--brand-deep)" }}>{modeLabel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium" style={{ color: "var(--brand-deep)" }}>File type:</span>
                  <span className="font-semibold" style={{ color: "var(--brand-deep)" }}>{fileType}</span>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {canSubmit && (
            <button
              type="button"
              onClick={() => void handleBalance()}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 text-sm font-semibold py-3 rounded-xl transition-colors"
              style={{ background: "var(--primary)", color: "var(--on-primary)" }}
            >
              Balance Audio
            </button>
          )}

          {stage === "processing" && (
            <button
              type="button"
              disabled
              className="mt-4 w-full inline-flex items-center justify-center gap-2 text-sm font-semibold py-3 rounded-xl"
              style={{ background: "var(--surface-3)", color: "var(--fg-subtle)", cursor: "not-allowed" }}
            >
              <Spinner />
            </button>
          )}

          {stage === "done" && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center justify-center gap-2 text-sm font-semibold py-3 rounded-xl"
                style={{ background: "var(--primary)", color: "var(--on-primary)" }}
              >
                <IcDownload /> Download Balanced Audio
              </button>
              <button
                type="button"
                onClick={balanceAgain}
                className="inline-flex items-center justify-center gap-2 text-fg text-sm font-semibold py-3 rounded-xl border border-line hover:bg-surface-2 transition-colors"
              >
                Balance Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
