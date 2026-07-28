"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { useJobPolling } from "./useJobPolling";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";

// ── Icons ─────────────────────────────────────────────────────────────────────
function IcCloud() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-gray-400">
      <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
    </svg>
  );
}

function IcX() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function IcMusic() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-[#335CFF]">
      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function IcDownload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

// Sad muffin SVG for empty state
function SadMuffin() {
  return (
    <svg viewBox="0 0 120 130" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-28 h-28">
      {/* sparkles */}
      <circle cx="18" cy="18" r="2.5" fill="#CBD5E1" />
      <circle cx="100" cy="22" r="2" fill="#CBD5E1" />
      <circle cx="108" cy="10" r="1.5" fill="#CBD5E1" />
      <line x1="100" y1="14" x2="100" y2="10" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="96" y1="16" x2="92" y2="13" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="104" y1="16" x2="108" y2="13" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" />
      {/* muffin top */}
      <ellipse cx="60" cy="52" rx="38" ry="34" fill="#D1D5DB" />
      {/* sparkle on top */}
      <circle cx="72" cy="30" r="3" fill="#9CA3AF" />
      {/* muffin base/wrapper */}
      <path d="M24 72 Q24 68 28 68 H92 Q96 68 96 72 L90 108 Q90 112 86 112 H34 Q30 112 30 108 Z" fill="#E5E7EB" />
      {/* wrapper lines */}
      <line x1="42" y1="68" x2="38" y2="112" stroke="#D1D5DB" strokeWidth="1.5" />
      <line x1="60" y1="68" x2="60" y2="112" stroke="#D1D5DB" strokeWidth="1.5" />
      <line x1="78" y1="68" x2="82" y2="112" stroke="#D1D5DB" strokeWidth="1.5" />
      {/* eyes (×) */}
      <line x1="46" y1="46" x2="52" y2="52" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="52" y1="46" x2="46" y2="52" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="68" y1="46" x2="74" y2="52" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="74" y1="46" x2="68" y2="52" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export default function VocalRemoverTool() {
  const { user, token, openAuthModal, refreshUser } = useAuth();
  const job = useJobPolling({ toolSlug: "vocal-remover", token });
  const fireReviewPrompt = useReviewPromptTrigger();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const downloadedForJobId = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("instrumental.mp3");
  const [dragging, setDragging] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const acceptFile = useCallback((f: File) => {
    // Matches the server's cap (app/api/tools/vocal-remover/route.ts) — gives
    // instant feedback instead of only finding out after a full upload.
    if (f.size > 50 * 1024 * 1024) {
      setPickError("File too large (max 50 MB).");
      return;
    }
    setPickError(null);
    setFile(f);
    job.reset();
    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); setDownloadUrl(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloadUrl]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  };

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

  const showRightResult = job.status === "done" && downloadUrl;
  const stage = file ? job.status === "idle" ? "ready" : job.status : "idle";

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-5">

        {/* ── Left panel ── */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 space-y-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">AI Vocal Remover</h1>
              <p className="text-sm text-red-500 mt-1 leading-relaxed">
                Upload your audio or video file and our AI will remove the vocals, leaving you with an instrumental track.
              </p>
            </div>

            {/* Upload zone or file chip */}
            {(stage === "idle" || stage === "ready") && (
              !file ? (
                <div
                  className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                    dragging ? "border-[#335CFF] bg-blue-50" : "border-gray-200 hover:border-gray-300 bg-gray-50"
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                >
                  <input ref={fileInputRef} type="file" accept="audio/*,video/*" className="hidden" onChange={onFileChange} />
                  <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                    <IcCloud />
                  </div>
                  <p className="text-sm font-semibold text-gray-800 mb-1">Upload audio/video</p>
                  <p className="text-sm text-[#335CFF] font-medium mb-3">Drag and drop or click to browse</p>
                  <p className="text-xs text-gray-400 text-center leading-relaxed">
                    .mp3, .wav, .ogg, .flac, .m4a, .aac, .mp4, .mov, .avi, .webm • Max 50 MB
                  </p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl p-4 flex items-center gap-3 bg-gray-50">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <IcMusic />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                    <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                  <button onClick={removeFile} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
                    <IcX />
                  </button>
                </div>
              )
            )}

            {/* File chip during processing / complete */}
            {(stage === "processing" || stage === "done") && file && (
              <div className="border border-gray-200 rounded-xl p-4 flex items-center gap-3 bg-gray-50">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <IcMusic />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                  <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
              </div>
            )}

            {/* Progress bar */}
            {stage === "processing" && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Removing vocals…</span>
                  <span>{job.progress}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="bg-[#335CFF] h-2 rounded-full transition-all duration-300" style={{ width: `${job.progress}%` }} />
                </div>
                <button
                  onClick={() => void job.cancel()}
                  className="text-xs font-medium text-gray-400 hover:text-red-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Error */}
            {pickError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{pickError}</p>
            )}
            {stage === "error" && job.error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{job.error}</p>
            )}

            {stage === "cancelled" && (
              <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                Cancelled — your credit was refunded.
              </p>
            )}

            {/* CTA button */}
            {stage !== "done" ? (
              <button
                onClick={handleRemove}
                disabled={stage === "processing" || !file}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #335CFF 0%, #7B5EA7 100%)" }}
              >
                {stage === "processing" ? "Removing Vocals…" : "Remove Vocals"}
              </button>
            ) : (
              <button
                onClick={handleAgain}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #335CFF 0%, #7B5EA7 100%)" }}
              >
                Remove Another
              </button>
            )}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="w-full lg:w-80 lg:flex-shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <p className="text-sm font-bold text-gray-900">Recent Vocal Removals</p>
              <p className="text-xs text-gray-400 mt-0.5">Select and upload the clip to remove vocal</p>
            </div>
            <button className="text-xs font-semibold text-[#335CFF] hover:underline flex-shrink-0">View All</button>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center p-6">
            {!showRightResult ? (
              /* Empty state */
              <div className="flex flex-col items-center text-center gap-3">
                <SadMuffin />
                <p className="text-base font-semibold text-gray-800">No Output Yet</p>
                <p className="text-sm text-[#335CFF]">First, Remove Vocals!</p>
              </div>
            ) : (
              /* Result state */
              <div className="w-full space-y-4">
                <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-2.5 border border-gray-100">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <IcMusic />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{downloadName}</p>
                    <p className="text-[10px] text-gray-400">Instrumental track</p>
                  </div>
                </div>

                <audio src={downloadUrl!} controls className="w-full rounded-lg" />

                <a
                  href={downloadUrl!}
                  download={downloadName}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #335CFF 0%, #7B5EA7 100%)" }}
                >
                  <IcDownload /> Download
                </a>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
