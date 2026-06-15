"use client";
import { useRef, useState, useEffect, type ReactNode } from "react";

type Stage = "idle" | "ready" | "converting" | "complete" | "error";

interface QualityOption {
  id: string;
  label: string;
  sub: string;
}

const QUALITY_OPTIONS: QualityOption[] = [
  { id: "minimum", label: "Minimum", sub: "Smallest file size" },
  { id: "low", label: "Low", sub: "Good balance" },
  { id: "medium", label: "Medium", sub: "Better quality" },
  { id: "high", label: "High", sub: "High quality" },
  { id: "maximum", label: "Maximum", sub: "Best quality" },
];

function fmtMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function truncate(name: string, max = 40): string {
  return name.length > max ? name.slice(0, max) + "…" : name;
}

// ── Icons ──────────────────────────────────────────────────────────────────
function IcCloud() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
    </svg>
  );
}
function IcMp3({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" />
      <path d="M8 16a1.5 1.5 0 103 0v-3.5l3-1V15a1.5 1.5 0 103 0" />
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

interface Props {
  icon?: ReactNode;
}

export default function Mp3ConverterTool(_props: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [dragging, setDragging] = useState(false);
  const [quality, setQuality] = useState("medium");
  const [progress, setProgress] = useState(0);
  const [realtime, setRealtime] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [durationSec, setDurationSec] = useState(0);
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    };
  }, [outputUrl]);

  function onPick(list: FileList | null) {
    if (!list || list.length === 0) return;
    const f = list[0];
    setFile(f);
    setStage("ready");
    setError(null);
    setProgress(0);
    setOutputBlob(null);
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
    setStage("idle");
    setProgress(0);
    setOutputBlob(null);
    if (outputUrl) { URL.revokeObjectURL(outputUrl); setOutputUrl(null); }
  }

  function stopPolling() {
    if (progressTimer.current) { clearInterval(progressTimer.current); progressTimer.current = null; }
  }

  async function handleConvert() {
    if (!file || stage === "converting") return;
    setStage("converting");
    setError(null);
    setProgress(0);
    setRealtime(0);
    startTimeRef.current = Date.now();
    try {
      // 1. Start the job — server returns a jobId immediately.
      const form = new FormData();
      form.append("file", file);
      form.append("quality", quality);
      const startRes = await fetch("/api/tools/mp3-converter", { method: "POST", body: form });
      if (!startRes.ok) {
        const json = await startRes.json().catch(() => ({})) as { error?: string };
        throw new Error(json.error ?? `Server error (${startRes.status})`);
      }
      const { jobId } = await startRes.json() as { jobId: string };

      // 2. Poll real FFmpeg progress until the job finishes.
      await new Promise<void>((resolve, reject) => {
        stopPolling();
        progressTimer.current = setInterval(async () => {
          try {
            const res = await fetch(`/api/tools/mp3-converter?jobId=${jobId}`);
            if (!res.ok) return;
            const data = await res.json() as { progress: number; status: string; error?: string };
            setProgress(data.progress);
            const elapsed = (Date.now() - startTimeRef.current) / 1000;
            if (durationSec > 0 && elapsed > 0) {
              setRealtime((durationSec * (data.progress / 100)) / elapsed);
            }
            if (data.status === "done") { stopPolling(); resolve(); }
            else if (data.status === "error") { stopPolling(); reject(new Error(data.error ?? "Conversion failed")); }
          } catch {
            // transient — keep polling
          }
        }, 400);
      });

      // 3. Download the finished file.
      const fileRes = await fetch(`/api/tools/mp3-converter?jobId=${jobId}&download=1`);
      if (!fileRes.ok) throw new Error("Failed to fetch converted file");
      const blob = await fileRes.blob();
      setProgress(100);
      const url = URL.createObjectURL(blob);
      setOutputBlob(blob);
      setOutputUrl(url);
      setStage("complete");
    } catch (err: unknown) {
      stopPolling();
      setError(err instanceof Error ? err.message : "Conversion failed");
      setStage("ready");
    }
  }

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
    setStage("ready");
    setProgress(0);
    setOutputBlob(null);
    if (outputUrl) { URL.revokeObjectURL(outputUrl); setOutputUrl(null); }
  }

  const busy = stage === "converting";
  // Quality is locked once conversion starts and stays locked on the result screen.
  const qualityLocked = stage === "converting" || stage === "complete";

  return (
    <div className="mx-auto w-full max-w-[1440px] px-8 pb-10">
      <div className="rounded-[28px] bg-gray-50 border border-gray-100 flex items-center justify-center p-8" style={{ minHeight: "calc(100vh - 132px)" }}>
        <div className="w-full max-w-[560px] bg-white rounded-2xl border border-gray-200 shadow-sm p-5">

          {/* Header */}
          <div className="flex items-start gap-3 pb-4 border-b border-gray-100">
            <div className="w-11 h-11 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 flex-shrink-0">
              <IcMp3 />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900 text-[17px] leading-tight">Convert to MP3</h2>
              <p className="text-sm text-gray-500 mt-1">Upload an audio or video file to convert to MP3.</p>
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
                style={{ borderColor: dragging ? "#93c5fd" : "#e5e7eb", background: dragging ? "#eff6ff" : "#ffffff" }}
              >
                <div className="w-12 h-12 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 mb-3">
                  <IcCloud />
                </div>
                <p className="text-[15px] font-semibold text-gray-900">Upload audio or video</p>
                <p className="text-sm text-gray-400 mt-1">Drag and drop or click to browse</p>
                <p className="text-xs text-gray-400 mt-2">.mp3, .wav, .aac, .mp4, .mov, .mkv, .webm • Max 500 MB</p>
              </button>
            </>
          )}

          {/* Uploaded file card */}
          {stage !== "idle" && file && (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-3">
              <span className="text-green-600 flex-shrink-0"><IcCheck /></span>
              <span className="w-8 h-8 rounded-lg bg-white border border-green-200 flex items-center justify-center text-gray-500 flex-shrink-0"><IcDoc /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-gray-900 truncate">{truncate(file.name)}</p>
                <p className="text-xs text-gray-500 mt-0.5">{fmtMB(file.size)} • Uploaded successfully</p>
              </div>
              {!busy && (
                <button type="button" onClick={clearFile} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                  <IcX />
                </button>
              )}
            </div>
          )}

          {/* Quality selector */}
          {stage !== "idle" && (
            <div className="mt-5">
              <p className="text-sm font-semibold text-gray-900 mb-2">MP3 Quality</p>
              <div className="grid grid-cols-5 gap-2">
                {QUALITY_OPTIONS.map(opt => {
                  const active = quality === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={qualityLocked}
                      onClick={() => setQuality(opt.id)}
                      className="rounded-lg border px-1 py-2 text-center transition-colors"
                      style={{
                        borderColor: active ? "#3b82f6" : "#e5e7eb",
                        background: active ? "#eff6ff" : "#ffffff",
                        opacity: qualityLocked && !active ? 0.5 : 1,
                        cursor: qualityLocked ? "not-allowed" : "pointer",
                      }}
                    >
                      <p className="text-[12px] font-semibold" style={{ color: active ? "#2563eb" : "#374151" }}>{opt.label}</p>
                      <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{opt.sub}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-500 text-center">{error}</p>}

          {/* Converting progress */}
          {stage === "converting" && (
            <div className="mt-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  Converting to MP3 with {QUALITY_OPTIONS.find(q => q.id === quality)?.label} quality…
                </span>
                {realtime > 0 && <span className="text-gray-400">~{realtime.toFixed(1)}x real time</span>}
              </div>
              <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full bg-blue-500 transition-all duration-150" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-1">{Math.round(progress)}% complete</p>
            </div>
          )}

          {/* Conversion complete */}
          {stage === "complete" && file && outputBlob && (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <div className="flex items-center gap-2 text-green-700 font-semibold">
                <IcCheck className="w-5 h-5" /> Conversion Complete
              </div>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Original size:</span>
                  <span className="font-medium text-gray-900">{fmtMB(file.size)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Output size:</span>
                  <span className="font-medium text-gray-900">{fmtMB(outputBlob.size)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {stage === "ready" && (
            <button
              type="button"
              onClick={handleConvert}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 text-white text-sm font-semibold py-3 rounded-xl transition-colors"
              style={{ background: "#2563eb" }}
            >
              Convert
            </button>
          )}

          {stage === "converting" && (
            <button
              type="button"
              disabled
              className="mt-4 w-full inline-flex items-center justify-center gap-2 text-white text-sm font-semibold py-3 rounded-xl"
              style={{ background: "#a5b4fc", cursor: "not-allowed" }}
            >
              <Spinner />
            </button>
          )}

          {stage === "complete" && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center justify-center gap-2 text-white text-sm font-semibold py-3 rounded-xl"
                style={{ background: "#2563eb" }}
              >
                <IcDownload /> Download Converted MP3
              </button>
              <button
                type="button"
                onClick={convertAgain}
                className="inline-flex items-center justify-center gap-2 text-gray-700 text-sm font-semibold py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Convert Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
