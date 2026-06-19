"use client";

import { useRef, useState, useCallback } from "react";
import { useAuth } from "@/app/components/AuthContext";

type Stage = "idle" | "ready" | "processing" | "complete" | "error";

export default function SubtitleRemoverTool() {
  const { refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("subtitle-removed.mp4");
  const [dragging, setDragging] = useState(false);

  const acceptFile = useCallback((f: File) => {
    if (!f.type.startsWith("video/")) {
      setErrorMsg("Please upload a video file (MP4, MOV, WEBM).");
      return;
    }
    setFile(f);
    setStage("ready");
    setErrorMsg("");
    setDownloadUrl(null);
  }, []);

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
    setStage("idle");
    setErrorMsg("");
    setDownloadUrl(null);
    setProgress(0);
  };

  const handleRemove = async () => {
    if (!file || stage === "processing") return;

    const token = localStorage.getItem("token");
    if (!token) {
      setErrorMsg("Please log in to use this tool.");
      return;
    }

    setStage("processing");
    setProgress(5);
    setErrorMsg("");

    try {
      const form = new FormData();
      form.append("video", file);

      const res = await fetch("/api/tools/subtitle-remover", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      const { jobId } = await res.json();
      const name = `subtitle-removed-${file.name}`;
      setDownloadName(name);

      // Poll for progress
      await new Promise<void>((resolve, reject) => {
        const interval = setInterval(async () => {
          try {
            const poll = await fetch(`/api/tools/subtitle-remover?jobId=${jobId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const data = await poll.json();
            if (data.progress != null) setProgress(data.progress);
            if (data.status === "done") {
              clearInterval(interval);
              resolve();
            } else if (data.status === "error") {
              clearInterval(interval);
              reject(new Error(data.error ?? "Processing failed"));
            }
          } catch (err) {
            clearInterval(interval);
            reject(err);
          }
        }, 500);
      });

      setProgress(100);

      // Download the result
      const dlRes = await fetch(`/api/tools/subtitle-remover?jobId=${jobId}&download=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!dlRes.ok) throw new Error("Download failed");

      const blob = await dlRes.blob();
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);

      // Auto-download
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();

      await refreshUser();
      setStage("complete");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setStage("error");
    }
  };

  const handleAgain = () => {
    setFile(null);
    setStage("idle");
    setProgress(0);
    setErrorMsg("");
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-8">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 pb-5">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Subtitle Remover</h1>
          <p className="text-[#335CFF] text-sm font-medium">
            Remove hardcoded subtitles from videos using AI
          </p>
        </div>

        <hr className="border-gray-100" />

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Upload zone */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Input Video
            </label>

            {!file ? (
              <div
                className={`relative border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                  dragging
                    ? "border-[#335CFF] bg-blue-50"
                    : "border-gray-200 hover:border-gray-300 bg-gray-50"
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
                  className="w-10 h-10 text-gray-400 mb-3"
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
                <p className="text-sm font-medium text-gray-700">Click to upload video</p>
                <p className="text-xs text-gray-400 mt-1">MP4, MOV, WEBM</p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl p-4 flex items-center gap-3 bg-gray-50">
                {/* Video file icon */}
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-[#335CFF]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M12 18.75H4.5a2.25 2.25 0 01-2.25-2.25V7.5A2.25 2.25 0 014.5 5.25H12a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                  <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                {stage !== "processing" && stage !== "complete" && (
                  <button
                    onClick={removeFile}
                    className="text-gray-400 hover:text-gray-600 transition-colors p-1"
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
          {stage === "processing" && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Removing subtitles…</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-[#335CFF] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {errorMsg && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorMsg}</p>
          )}

          {/* Complete actions */}
          {stage === "complete" && downloadUrl && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-3">
              <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-green-700 font-medium flex-1">Done! File downloaded.</p>
              <a
                href={downloadUrl}
                download={downloadName}
                className="text-xs text-[#335CFF] font-medium hover:underline"
              >
                Download again
              </a>
            </div>
          )}

          {/* Main CTA */}
          {stage !== "complete" ? (
            <button
              onClick={handleRemove}
              disabled={stage !== "ready" && stage !== "error"}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #335CFF 0%, #7B5EA7 100%)" }}
            >
              {stage === "processing" ? "Removing…" : "Remove Subtitles"}
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
