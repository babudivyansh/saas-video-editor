"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useJobPolling } from "./useJobPolling";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { useUploadEntitlement } from "@/app/hooks/useUploadEntitlement";

function IcUpload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  );
}
function IcX() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
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

interface ImageSlot {
  file: File | null;
  preview: string | null;
}

function ImageDropZone({
  label,
  sublabel,
  slot,
  disabled,
  onPick,
  onClear,
}: {
  label: string;
  sublabel: string;
  slot: ImageSlot;
  disabled: boolean;
  onPick: (f: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { maxBytes: uploadMaxBytes } = useUploadEntitlement("face-swap");

  function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowed.includes(f.type)) return;
    if (uploadMaxBytes != null && f.size > uploadMaxBytes) return;
    onPick(f);
  }

  return (
    <div className="flex-1">
      <p className="text-[13px] font-semibold text-fg mb-0.5">{label}</p>
      <p className="text-[12px] text-fg-subtle mb-2">{sublabel}</p>

      {slot.file && slot.preview ? (
        <div className="relative rounded-xl overflow-hidden border border-line bg-surface-2 aspect-square">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slot.preview} alt={label} className="w-full h-full object-cover" />
          {!disabled && (
            <button
              type="button"
              onClick={onClear}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 hover:bg-black/850 text-white flex items-center justify-center transition-colors"
            >
              <IcX />
            </button>
          )}
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            disabled={disabled}
            onChange={e => pick(e.target.files)}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files); }}
            className="w-full aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              borderColor: dragging ? "#6366f1" : "#e5e7eb",
              background: dragging ? "#eef2ff" : "#fafafa",
            }}
          >
            <span className="text-brand"><IcUpload /></span>
            <span className="text-[12px] font-medium text-brand">Click or drag to upload</span>
            <span className="text-[11px] text-fg-subtle">PNG, JPG, WEBP</span>
          </button>
        </>
      )}
    </div>
  );
}

export default function FaceSwapTool() {
  const { user, token, openAuthModal, refreshUser } = useAuth();
  const job = useJobPolling({ toolSlug: "face-swap", token });
  const fireReviewPrompt = useReviewPromptTrigger();
  const submittingRef = useRef(false);
  const downloadedForJobId = useRef<string | null>(null);

  const [charSlot, setCharSlot] = useState<ImageSlot>({ file: null, preview: null });
  const [targSlot, setTargSlot] = useState<ImageSlot>({ file: null, preview: null });
  const [prompt, setPrompt]     = useState("");
  const [cleanUp, setCleanUp]   = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  function pickFile(which: "char" | "targ", file: File) {
    const preview = URL.createObjectURL(file);
    if (which === "char") {
      if (charSlot.preview) URL.revokeObjectURL(charSlot.preview);
      setCharSlot({ file, preview });
    } else {
      if (targSlot.preview) URL.revokeObjectURL(targSlot.preview);
      setTargSlot({ file, preview });
    }
  }

  function clearFile(which: "char" | "targ") {
    if (which === "char") {
      if (charSlot.preview) URL.revokeObjectURL(charSlot.preview);
      setCharSlot({ file: null, preview: null });
    } else {
      if (targSlot.preview) URL.revokeObjectURL(targSlot.preview);
      setTargSlot({ file: null, preview: null });
    }
  }

  function reset() {
    clearFile("char");
    clearFile("targ");
    setPrompt("");
    setCleanUp(false);
    job.reset();
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
  }

  const handleGenerate = useCallback(async () => {
    if (!charSlot.file || !targSlot.file) return;
    if (!user || !token) { openAuthModal("login", "AI Face Swap"); return; }
    if (submittingRef.current) return;
    submittingRef.current = true;

    if (resultUrl) { URL.revokeObjectURL(resultUrl); setResultUrl(null); }

    const idempotencyKey = crypto.randomUUID();
    try {
      await job.start(async () => {
        const form = new FormData();
        form.append("characterImage", charSlot.file!);
        form.append("targetImage", targSlot.file!);
        if (prompt.trim()) form.append("prompt", prompt.trim());
        if (cleanUp) form.append("cleanUp", "1");
        form.append("idempotencyKey", idempotencyKey);

        const res = await fetch("/api/tools/face-swap", {
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
  }, [charSlot.file, targSlot.file, user, token, openAuthModal, prompt, cleanUp, resultUrl, job]);

  // Once the job is done, fetch the result image.
  useEffect(() => {
    if (job.status !== "done" || !job.jobId || !token) return;
    if (downloadedForJobId.current === job.jobId) return;
    downloadedForJobId.current = job.jobId;
    fireReviewPrompt("tool_generation_complete", { featureHint: "ai_tools" }).catch(() => { /* non-critical */ });

    (async () => {
      try {
        const dlRes = await fetch(`/api/tools/face-swap?jobId=${job.jobId}&download=1`, {
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

  // Revoke the held result object URL on unmount.
  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDownload() {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = "face-swap-result.jpg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const busy = job.status === "processing";
  const canGenerate = !!charSlot.file && !!targSlot.file && !busy;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-8 pb-10">
      <div className="rounded-[28px] bg-surface-2 border border-line flex items-start justify-center p-8" style={{ minHeight: "calc(100vh - 132px)" }}>
        <div className="w-full max-w-[680px] bg-panel rounded-2xl border border-line shadow-sm p-6 mt-4">

          {/* Header */}
          <div className="flex items-center gap-3 pb-4 border-b border-line">
            <div className="w-10 h-10 rounded-full border border-line flex items-center justify-center text-fg-muted flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <div>
              <h2 className="font-bold text-fg text-[17px] leading-tight">Face Swap</h2>
              <p className="text-[13px] text-fg-muted mt-0.5">Swap faces between two images using AI</p>
            </div>
          </div>

          {/* Result view */}
          {job.status === "done" && resultUrl ? (
            <div className="mt-5 space-y-4">
              <p className="text-[11px] font-bold text-fg-subtle uppercase tracking-wide">Result</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resultUrl} alt="Face swap result" className="w-full rounded-xl border border-line object-contain max-h-[500px]" />
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center justify-center gap-2 bg-brand hover:bg-brand-dark text-on-primary text-sm font-semibold py-3 rounded-xl transition-colors"
                >
                  <IcDownload /> Download Image
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center justify-center gap-2 border border-line hover:bg-surface-2 text-fg text-sm font-semibold py-3 rounded-xl transition-colors"
                >
                  Swap Again
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Upload panels */}
              <div className="mt-5 flex gap-4">
                <ImageDropZone
                  label="Character Image"
                  sublabel="The face to use"
                  slot={charSlot}
                  disabled={busy}
                  onPick={f => pickFile("char", f)}
                  onClear={() => clearFile("char")}
                />
                <ImageDropZone
                  label="Target Image"
                  sublabel="The image to swap into"
                  slot={targSlot}
                  disabled={busy}
                  onPick={f => pickFile("targ", f)}
                  onClear={() => clearFile("targ")}
                />
              </div>

              {/* Prompt */}
              <div className="mt-5">
                <label className="text-[13px] font-semibold text-fg">
                  Prompt <span className="text-fg-subtle font-normal">(optional)</span>
                </label>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  disabled={busy}
                  placeholder="Describe any adjustments or style changes..."
                  rows={3}
                  className="mt-1.5 w-full bg-surface-2 border border-line rounded-xl px-4 py-3 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none disabled:opacity-50"
                />
              </div>

              {/* Clean up checkbox */}
              <label className="mt-3 flex items-center gap-2.5 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={cleanUp}
                  onChange={e => setCleanUp(e.target.checked)}
                  disabled={busy}
                  className="w-4 h-4 rounded border-line-strong text-brand focus:ring-primary/40 cursor-pointer"
                />
                <span className="text-[13px] text-fg font-medium">Clean up result</span>
              </label>

              {/* Progress */}
              {busy && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-fg-muted">Swapping faces…</span>
                    <span className="text-fg-subtle">{Math.round(job.progress)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full bg-brand transition-all duration-300" style={{ width: `${job.progress}%` }} />
                  </div>
                  <button
                    type="button"
                    onClick={() => void job.cancel()}
                    className="mt-2 text-xs font-medium text-fg-subtle hover:text-error transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {job.status === "error" && job.error && (
                <p className="mt-3 text-sm text-error text-center">{job.error}</p>
              )}

              {job.status === "cancelled" && (
                <p className="mt-3 text-sm text-fg-muted text-center">Cancelled — your credit was refunded.</p>
              )}

              {!user && (
                <p className="mt-3 text-xs text-fg-subtle text-center">You&apos;ll be asked to sign in to generate.</p>
              )}

              {/* Generate button */}
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={!canGenerate}
                className="mt-5 w-full inline-flex items-center justify-center gap-2 text-white text-sm font-semibold py-3.5 rounded-xl transition-colors disabled:cursor-not-allowed"
                style={{ background: canGenerate ? "#6366f1" : "#c7d2fe" }}
              >
                {busy ? <><Spinner /> Processing…</> : "Generate Face Swap"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
