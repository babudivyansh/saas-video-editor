"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useJobPolling } from "@/app/components/useJobPolling";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { useUploadEntitlement } from "@/app/hooks/useUploadEntitlement";

export default function SubtitleRemoverTool() {
  const { token, refreshUser } = useAuth();
  const { maxBytes: uploadMaxBytes, formattedMaxSize: uploadMaxSizeLabel } = useUploadEntitlement("subtitle-remover");
  const job = useJobPolling({ toolSlug: "subtitle-remover", token });
  const fireReviewPrompt = useReviewPromptTrigger();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("subtitle-removed.mp4");
  const [dragging, setDragging] = useState(false);
  const [compareView, setCompareView] = useState<"before" | "after">("after");
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
    setFile(f);
    setOriginalPreviewUrl(URL.createObjectURL(f));
    setErrorMsg("");
    setDownloadUrl(null);
    setCompareView("after");
    job.reset();
  }, [job, originalPreviewUrl, uploadMaxBytes, MAX_MB_LABEL]);

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
    if (!token) {
      setErrorMsg("Please log in to use this tool.");
      return;
    }
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
  }, [file, job, token]);

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

  return (
    <div className="min-h-screen bg-surface-2 flex items-start justify-center p-4 sm:p-8">
      <div className="w-full max-w-lg bg-panel rounded-2xl shadow-sm border border-line overflow-hidden">
        {/* Header */}
        <div className="p-6 pb-5">
          <h1 className="text-2xl font-bold text-fg mb-1">Subtitle Remover</h1>
          <p className="text-brand text-sm font-medium">
            Remove hardcoded subtitles from videos using AI
          </p>
        </div>

        <hr className="border-line" />

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Upload zone */}
          <div>
            <label className="block text-sm font-semibold text-fg mb-2">
              Input Video
            </label>

            {!file ? (
              <div
                className={`relative border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                  dragging
                    ? "border-brand bg-tint-blue"
                    : "border-line hover:border-line-strong bg-surface-2"
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={onFileChange}
                />
                {/* Upload arrow icon */}
                <svg
                  className="w-10 h-10 text-fg-subtle mb-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
                <p className="text-sm font-medium text-fg">Click to upload video</p>
                <p className="text-xs text-fg-subtle mt-1">MP4, MOV, WEBM &bull; Max {MAX_MB_LABEL}</p>
              </div>
            ) : (
              <div className="border border-line rounded-xl p-4 flex items-center gap-3 bg-surface-2">
                {/* Video file icon */}
                <div className="w-10 h-10 rounded-lg bg-tint-violet flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M12 18.75H4.5a2.25 2.25 0 01-2.25-2.25V7.5A2.25 2.25 0 014.5 5.25H12a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fg truncate">{file.name}</p>
                  <p className="text-xs text-fg-subtle">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                {job.status !== "processing" && !isComplete && (
                  <button
                    onClick={removeFile}
                    className="text-fg-subtle hover:text-fg-muted transition-colors p-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Progress bar */}
          {job.status === "processing" && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-fg-muted">
                <span>Removing subtitles…</span>
                <span>{job.progress}%</span>
              </div>
              <div className="w-full bg-surface-3 rounded-full h-2">
                <div
                  className="bg-brand h-2 rounded-full transition-all duration-300"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
              <button
                onClick={() => void job.cancel()}
                className="text-xs font-medium text-fg-subtle hover:text-error transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Error */}
          {(errorMsg || (job.status === "error" && job.error)) && (
            <div className="flex items-center justify-between gap-2 text-sm text-error bg-error/10 rounded-lg px-3 py-2">
              <span>{errorMsg || job.error}</span>
              {job.status === "error" && (
                <button onClick={() => void handleRemove()} className="text-xs font-semibold underline underline-offset-2 hover:text-error flex-shrink-0">
                  Retry
                </button>
              )}
            </div>
          )}

          {job.status === "cancelled" && (
            <p className="text-sm text-fg-muted bg-surface-2 border border-line rounded-lg px-3 py-2">
              Cancelled — your credit was refunded.
            </p>
          )}

          {/* Complete actions */}
          {isComplete && downloadUrl && (
            <>
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-3">
                <svg className="w-5 h-5 text-success shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-green-700 font-medium flex-1">Done! File downloaded.</p>
                <a
                  href={downloadUrl}
                  download={downloadName}
                  className="text-xs text-brand font-medium hover:underline"
                >
                  Download again
                </a>
              </div>

              {job.meta?.regionsDetected === 0 ? (
                <p className="text-sm text-fg-muted bg-surface-2 border border-line rounded-lg px-3 py-2">
                  No on-screen text was detected in this video, so nothing was changed.
                </p>
              ) : (
                <div className="space-y-2">
                  {typeof job.meta?.regionsDetected === "number" && (
                    <p className="text-xs text-fg-subtle">
                      {job.meta.regionsDetected} text region{job.meta.regionsDetected === 1 ? "" : "s"} detected and removed.
                    </p>
                  )}
                  <div className="inline-flex rounded-lg border border-line p-0.5 bg-surface-2">
                    <button
                      onClick={() => setCompareView("before")}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${compareView === "before" ? "bg-panel text-fg shadow-sm" : "text-fg-muted"}`}
                    >
                      Before
                    </button>
                    <button
                      onClick={() => setCompareView("after")}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${compareView === "after" ? "bg-panel text-fg shadow-sm" : "text-fg-muted"}`}
                    >
                      After
                    </button>
                  </div>
                  {originalPreviewUrl && (
                    <video
                      key={compareView}
                      src={compareView === "before" ? originalPreviewUrl : downloadUrl}
                      controls
                      className="w-full rounded-xl border border-line bg-black"
                    />
                  )}
                </div>
              )}
            </>
          )}

          {/* Main CTA */}
          {!isComplete ? (
            <button
              onClick={handleRemove}
              disabled={!file || job.status === "processing"}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #335CFF 0%, #7B5EA7 100%)" }}
            >
              {job.status === "processing" ? "Removing…" : "Remove Subtitles"}
            </button>
          ) : (
            <button
              onClick={handleAgain}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity"
              style={{ background: "linear-gradient(135deg, #335CFF 0%, #7B5EA7 100%)" }}
            >
              Remove Another
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
