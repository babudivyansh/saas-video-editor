"use client";
import { useRef, useState, useEffect } from "react";
import { useAuth } from "@/app/components/AuthContext";

type Stage = "idle" | "ready" | "processing" | "done" | "error";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function onPick(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
    if (!allowed.includes(f.type)) {
      setError("Only PNG, JPG, WEBP, GIF images are supported.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("File too large (max 10 MB).");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStage("ready");
    setError(null);
    setResultUrl(null);
    setResultBlob(null);
  }

  function clearFile() {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setStage("idle");
    setProgress(0);
    setError(null);
    setResultUrl(null);
    setResultBlob(null);
  }

  async function handleRemove() {
    if (!file || stage === "processing") return;
    if (!user || !token) { openAuthModal("login", "AI Background Remover"); return; }

    setStage("processing");
    setError(null);
    setProgress(5);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/tools/background-remover", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? `Error ${res.status}`);
      }
      const { jobId } = await res.json() as { jobId: string };

      await new Promise<void>((resolve, reject) => {
        pollRef.current = setInterval(async () => {
          try {
            const r = await fetch(`/api/tools/background-remover?jobId=${jobId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!r.ok) return;
            const d = await r.json() as { progress: number; status: string; error?: string };
            setProgress(d.progress);
            if (d.status === "done") { clearInterval(pollRef.current!); resolve(); }
            else if (d.status === "error") { clearInterval(pollRef.current!); reject(new Error(d.error ?? "Processing failed")); }
          } catch { /* transient */ }
        }, 1500);
      });

      // Download result
      const dlRes = await fetch(`/api/tools/background-remover?jobId=${jobId}&download=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!dlRes.ok) throw new Error("Failed to retrieve result");
      const blob = await dlRes.blob();
      setResultBlob(blob);
      setResultUrl(URL.createObjectURL(blob));
      setProgress(100);
      setStage("done");
      await refreshUser();
    } catch (err) {
      if (pollRef.current) clearInterval(pollRef.current);
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStage("ready");
    }
  }

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

  const busy = stage === "processing";

  return (
    <div className="mx-auto w-full max-w-[1440px] px-8 pb-10">
      <div className="rounded-[28px] bg-gray-50 border border-gray-100 flex items-start justify-center p-8" style={{ minHeight: "calc(100vh - 132px)" }}>
        <div className="w-full max-w-[600px] bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mt-4">

          {/* Header */}
          <div className="flex items-start gap-3 pb-4 border-b border-gray-100">
            <div className="w-11 h-11 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 flex-shrink-0">
              <IcImage />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900 text-[17px] leading-tight">Remove Background</h2>
              <p className="text-sm text-gray-500 mt-0.5">Upload an image to remove the background.</p>
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
                <div className="w-14 h-14 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 mb-3">
                  <IcCloud />
                </div>
                <p className="text-[15px] font-semibold text-gray-900">Upload image/video</p>
                <p className="text-sm text-gray-400 mt-1">Drag and drop or click to browse</p>
                <p className="text-xs text-gray-400 mt-2">.png, .jpg, .jpeg, .webp, .gif • Max 10 MB</p>
              </button>
            </>
          )}

          {/* Image preview + result side by side */}
          {stage !== "idle" && file && (
            <div className="mt-4 space-y-4">
              {/* File info bar */}
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-2.5">
                <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-400 flex-shrink-0">
                  <IcImage />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 truncate">{truncate(file.name)}</p>
                  <p className="text-xs text-gray-400">{fmtMB(file.size)}</p>
                </div>
                {!busy && (
                  <button type="button" onClick={clearFile} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                    <IcX />
                  </button>
                )}
              </div>

              {/* Before / After panels */}
              <div className={`grid gap-3 ${stage === "done" ? "grid-cols-2" : "grid-cols-1"}`}>
                {/* Original */}
                <div>
                  {stage === "done" && <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Original</p>}
                  <div className="rounded-xl overflow-hidden border border-gray-100 bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview!} alt="Original" className="w-full object-contain max-h-64" />
                  </div>
                </div>

                {/* Result */}
                {stage === "done" && resultUrl && (
                  <div>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Background Removed</p>
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
                    <span className="text-gray-600">Removing background…</span>
                    <span className="text-gray-400">{Math.round(progress)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {error && (
                <p className="text-sm text-red-500 text-center">{error}</p>
              )}

              {!user && stage !== "processing" && (
                <p className="text-xs text-gray-400 text-center">You&apos;ll be asked to sign in to process.</p>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-4 space-y-2">
            {(stage === "ready" || stage === "done") && !busy && (
              <button
                type="button"
                onClick={() => void handleRemove()}
                className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-3 rounded-xl transition-colors"
              >
                Remove BG
              </button>
            )}

            {busy && (
              <button
                type="button"
                disabled
                className="w-full inline-flex items-center justify-center gap-2 bg-blue-300 text-white text-sm font-semibold py-3 rounded-xl cursor-not-allowed"
              >
                <Spinner /> Processing…
              </button>
            )}

            {stage === "done" && resultUrl && (
              <button
                type="button"
                onClick={handleDownload}
                className="w-full inline-flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold py-3 rounded-xl transition-colors"
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
