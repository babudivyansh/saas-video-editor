"use client";
import { useCallback, useRef, useState, useEffect } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useJobPolling } from "./useJobPolling";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { useUploadEntitlement } from "@/app/hooks/useUploadEntitlement";

function IcCloud() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
    </svg>
  );
}
function IcImage() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
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
function IcX() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M18 6L6 18M6 6l12 12" />
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

function truncate(s: string, max = 40) {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
function fmtMB(b: number) {
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

// Checkerboard pattern to show transparency
function CheckerBg({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        backgroundImage:
          "linear-gradient(45deg,#ccc 25%,transparent 25%)," +
          "linear-gradient(-45deg,#ccc 25%,transparent 25%)," +
          "linear-gradient(45deg,transparent 75%,#ccc 75%)," +
          "linear-gradient(-45deg,transparent 75%,#ccc 75%)",
        backgroundSize: "16px 16px",
        backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
        backgroundColor: "#f9f9f9",
      }}
    >
      {children}
    </div>
  );
}

export default function BackgroundRemoverTool() {
  const { user, token, openAuthModal, refreshUser } = useAuth();
  const job = useJobPolling({ toolSlug: "background-remover", token });
  const fireReviewPrompt = useReviewPromptTrigger();
  const submittingRef = useRef(false);
  const downloadedForJobId = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const { maxBytes: uploadMaxBytes, formattedMaxSize: uploadMaxSizeLabel } = useUploadEntitlement("background-remover");
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPick(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
    if (!allowed.includes(f.type)) {
      setPickError("Only PNG, JPG, WEBP, GIF images are supported.");
      return;
    }
    if (uploadMaxBytes != null && f.size > uploadMaxBytes) {
      setPickError(`File too large (max ${uploadMaxSizeLabel}).`);
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    job.reset();
    setPickError(null);
    if (resultUrl) { URL.revokeObjectURL(resultUrl); setResultUrl(null); }
  }

  function clearFile() {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    job.reset();
    setPickError(null);
    if (resultUrl) { URL.revokeObjectURL(resultUrl); setResultUrl(null); }
  }

  const handleRemove = useCallback(async () => {
    if (!file || job.status === "processing") return;
    if (!user || !token) { openAuthModal("login", "AI Background Remover"); return; }
    if (submittingRef.current) return;
    submittingRef.current = true;

    if (resultUrl) { URL.revokeObjectURL(resultUrl); setResultUrl(null); }

    const idempotencyKey = crypto.randomUUID();
    try {
      await job.start(async () => {
        const form = new FormData();
        form.append("file", file);
        form.append("idempotencyKey", idempotencyKey);
        const res = await fetch("/api/tools/background-remover", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(d.error ?? `Error ${res.status}`);
        }
        return (await res.json()) as { jobId: string };
      });
    } finally {
      submittingRef.current = false;
    }
  }, [file, user, token, openAuthModal, resultUrl, job]);

  // Once the job is done, fetch the result image.
  useEffect(() => {
    if (job.status !== "done" || !job.jobId || !token) return;
    if (downloadedForJobId.current === job.jobId) return;
    downloadedForJobId.current = job.jobId;
    fireReviewPrompt("tool_generation_complete", { featureHint: "ai_tools" }).catch(() => { /* non-critical */ });

    (async () => {
      try {
        const dlRes = await fetch(`/api/tools/background-remover?jobId=${job.jobId}&download=1`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!dlRes.ok) throw new Error("Failed to retrieve result");
        const blob = await dlRes.blob();
        setResultUrl(URL.createObjectURL(blob));
        await refreshUser();
      } catch {
        // The job itself succeeded; leave the user on the done screen without
        // a preview rather than flipping to an error state.
      }
    })();
  }, [job.status, job.jobId, token, refreshUser, fireReviewPrompt]);

  function handleDownload() {
    if (!resultUrl || !file) return;
    const base = file.name.replace(/\.[^.]+$/, "");
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `${base}-no-bg.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const stage = file ? (job.status === "idle" ? "ready" : job.status) : "idle";
  const busy = stage === "processing";

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 md:px-8 pb-10">
      <div className="rounded-[28px] bg-surface-2 border border-line flex items-start justify-center p-4 md:p-8" style={{ minHeight: "calc(100vh - 132px)" }}>
        <div className="w-full max-w-[600px] bg-panel rounded-2xl border border-line shadow-sm p-5 mt-4">

          {/* Header */}
          <div className="flex items-start gap-3 pb-4 border-b border-line">
            <div className="w-11 h-11 rounded-full border border-line flex items-center justify-center text-fg-muted flex-shrink-0">
              <IcImage />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-fg text-[17px] leading-tight">Remove Background</h2>
              <p className="text-sm text-fg-muted mt-0.5">Upload an image to remove the background.</p>
            </div>
          </div>

          {/* Dropzone */}
          {stage === "idle" && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                className="hidden"
                onChange={e => onPick(e.target.files)}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); onPick(e.dataTransfer.files); }}
                className="mt-4 w-full rounded-xl border transition-colors flex flex-col items-center justify-center text-center px-6 py-12"
                style={{ borderColor: dragging ? "#93c5fd" : "#e5e7eb", background: dragging ? "#eff6ff" : "#fafafa" }}
              >
                <div className="w-14 h-14 rounded-full bg-panel border border-line flex items-center justify-center text-fg-subtle mb-3">
                  <IcCloud />
                </div>
                <p className="text-[15px] font-semibold text-fg">Upload image/video</p>
                <p className="text-sm text-fg-subtle mt-1">Drag and drop or click to browse</p>
                <p className="text-xs text-fg-subtle mt-2">.png, .jpg, .jpeg, .webp, .gif • Max 10 MB</p>
              </button>
            </>
          )}

          {/* Image preview + result side by side */}
          {stage !== "idle" && file && (
            <div className="mt-4 space-y-4">
              {/* File info bar */}
              <div className="flex items-center gap-3 bg-surface-2 rounded-xl px-4 py-2.5">
                <div className="w-8 h-8 rounded-lg bg-panel border border-line flex items-center justify-center text-fg-subtle flex-shrink-0">
                  <IcImage />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-fg truncate">{truncate(file.name)}</p>
                  <p className="text-xs text-fg-subtle">{fmtMB(file.size)}</p>
                </div>
                {!busy && (
                  <button type="button" onClick={clearFile} className="text-fg-subtle hover:text-fg-muted flex-shrink-0">
                    <IcX />
                  </button>
                )}
              </div>

              {/* Before / After panels */}
              <div className={`grid gap-3 ${stage === "done" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
                {/* Original */}
                <div>
                  {stage === "done" && <p className="text-[11px] font-bold text-fg-subtle uppercase tracking-wide mb-1.5">Original</p>}
                  <div className="rounded-xl overflow-hidden border border-line bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview!} alt="Original" className="w-full object-contain max-h-64" />
                  </div>
                </div>

                {/* Result */}
                {stage === "done" && resultUrl && (
                  <div>
                    <p className="text-[11px] font-bold text-fg-subtle uppercase tracking-wide mb-1.5">Background Removed</p>
                    <CheckerBg>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={resultUrl} alt="Result" className="w-full object-contain max-h-64" />
                    </CheckerBg>
                  </div>
                )}
              </div>

              {/* Progress bar */}
              {busy && (
                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-fg-muted">Removing background…</span>
                    <span className="text-fg-subtle">{Math.round(job.progress)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                    <div
                      className="h-full bg-brand transition-all duration-300"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {pickError && (
                <p className="text-sm text-error text-center">{pickError}</p>
              )}

              {stage === "error" && job.error && (
                <p className="text-sm text-error text-center">{job.error}</p>
              )}

              {stage === "cancelled" && (
                <p className="text-sm text-fg-muted text-center">Cancelled — your credit was refunded.</p>
              )}

              {!user && stage !== "processing" && (
                <p className="text-xs text-fg-subtle text-center">You&apos;ll be asked to sign in to process.</p>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-4 space-y-2">
            {(stage === "ready" || stage === "done" || stage === "error" || stage === "cancelled") && !busy && (
              <button
                type="button"
                onClick={() => void handleRemove()}
                className="w-full inline-flex items-center justify-center gap-2 bg-brand hover:bg-brand-dark text-on-primary text-sm font-semibold py-3 rounded-xl transition-colors"
              >
                Remove BG
              </button>
            )}

            {busy && (
              <div className="space-y-1.5">
                <button
                  type="button"
                  disabled
                  className="w-full inline-flex items-center justify-center gap-2 bg-brand/50 text-on-primary text-sm font-semibold py-3 rounded-xl cursor-not-allowed"
                >
                  <Spinner /> Processing…
                </button>
                <button
                  type="button"
                  onClick={() => void job.cancel()}
                  className="w-full text-center text-xs font-medium text-fg-subtle hover:text-error transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {stage === "done" && resultUrl && (
              <button
                type="button"
                onClick={handleDownload}
                className="w-full inline-flex items-center justify-center gap-2 border border-line hover:bg-surface-2 text-fg text-sm font-semibold py-3 rounded-xl transition-colors"
              >
                <IcDownload /> Download PNG
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
