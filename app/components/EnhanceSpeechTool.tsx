"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useJobPolling } from "./useJobPolling";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { useUploadEntitlement } from "@/app/hooks/useUploadEntitlement";

function IcLink() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

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

function IcAudio() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-[#335CFF]">
      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
    </svg>
  );
}

export default function EnhanceSpeechTool() {
  const { user, token, openAuthModal, refreshUser } = useAuth();
  const job = useJobPolling({ toolSlug: "enhance-speech", token });
  const fireReviewPrompt = useReviewPromptTrigger();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const downloadedForJobId = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("enhanced-audio.mp3");
  const [dragging, setDragging] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const { maxBytes: uploadMaxBytes, formattedMaxSize: uploadMaxSizeLabel } = useUploadEntitlement("enhance-speech");

  const acceptFile = useCallback((f: File) => {
    // Mirrors the server's effective cap (app/api/tools/enhance-speech/route.ts,
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

  const handleGenerate = useCallback(async () => {
    if (!user || !token) { openAuthModal("login", "Enhance Speech"); return; }
    if (!file || job.status === "processing") return;
    if (submittingRef.current) return;
    submittingRef.current = true;

    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); setDownloadUrl(null); }
    const name = `enhanced-${file.name.replace(/\.[^.]+$/, "")}.mp3`;
    setDownloadName(name);

    const idempotencyKey = crypto.randomUUID();
    try {
      await job.start(async () => {
        const form = new FormData();
        form.append("file", file);
        form.append("idempotencyKey", idempotencyKey);

        const res = await fetch("/api/tools/enhance-speech", {
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
        const dlRes = await fetch(`/api/tools/enhance-speech?jobId=${job.jobId}&download=1`, {
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
        // user has to use "Download again" — no need to flip to an error state.
      }
    })();
  }, [job.status, job.jobId, token, downloadName, refreshUser, fireReviewPrompt]);

  const handleAgain = () => {
    setFile(null);
    job.reset();
    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); setDownloadUrl(null); }
  };

  const stage = file ? (job.status === "idle" ? "ready" : job.status) : "idle";

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 md:p-8">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

        {/* Header */}
        <div className="p-6 pb-5 flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <IcLink />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">Enhance Speech</h1>
            <p className="text-sm text-[#335CFF] mt-0.5">Upload a video or audio file to enhance the audio clarity.</p>
          </div>
        </div>

        <hr className="border-gray-100" />

        {/* Body */}
        <div className="p-6 space-y-4">

          {/* Upload zone or file chip */}
          {stage === "idle" || stage === "ready" ? (
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
                  .mp3, .wav, .m4a, .ogg, .aac, .mp4, .mov, .avi, .webm • Max 50 MB
                </p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl p-4 flex items-center gap-3 bg-gray-50">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <IcAudio />
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
          ) : null}

          {/* File chip during processing / complete */}
          {(stage === "processing" || stage === "done") && file && (
            <div className="border border-gray-200 rounded-xl p-4 flex items-center gap-3 bg-gray-50">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <IcAudio />
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
                <span>Enhancing…</span>
                <span>{job.progress}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-[#335CFF] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${job.progress}%` }}
                />
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

          {/* Complete */}
          {stage === "done" && downloadUrl && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-3">
              <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-green-700 font-medium flex-1">Done! Audio downloaded.</p>
              <a href={downloadUrl} download={downloadName} className="text-xs text-[#335CFF] font-medium hover:underline">
                Download again
              </a>
            </div>
          )}

          {/* CTA */}
          {stage !== "done" ? (
            <button
              onClick={() => void handleGenerate()}
              disabled={stage === "processing" || !file}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #335CFF 0%, #7B5EA7 100%)" }}
            >
              {stage === "processing" ? "Enhancing…" : "Generate Audio"}
            </button>
          ) : (
            <button
              onClick={handleAgain}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #335CFF 0%, #7B5EA7 100%)" }}
            >
              Enhance Another
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
