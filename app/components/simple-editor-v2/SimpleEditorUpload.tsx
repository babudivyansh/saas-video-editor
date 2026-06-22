"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSimpleEditorStore } from "./store/simpleEditorStore";

function token() {
  return typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "";
}

function authHeaders() {
  return { Authorization: `Bearer ${token()}` };
}

export default function SimpleEditorUpload() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const setVideo = useSimpleEditorStore(s => s.setVideo);
  const setProject = useSimpleEditorStore(s => s.setProject);
  const setAnalysisStep = useSimpleEditorStore(s => s.setAnalysisStep);

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("video/")) {
      setError("Please upload a video file (MP4, MOV, or WEBM).");
      return;
    }
    setError(null);
    setUploading(true);
    setUploadProgress(10);
    setAnalysisStep("uploading");

    try {
      // 1. Upload to S3
      const fd = new FormData();
      fd.append("file", file);
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });
      if (!uploadRes.ok) {
        const e = await uploadRes.json().catch(() => ({}));
        throw new Error(e.error ?? `Upload failed (${uploadRes.status})`);
      }
      const { url, key } = await uploadRes.json();
      setUploadProgress(40);

      // 2. Get video duration
      const duration = await getVideoDuration(url);
      setVideo(url, key, duration);
      setUploadProgress(55);

      // 3. Create project
      const projectRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          title: file.name.replace(/\.[^.]+$/, "") || "Untitled Reel",
          productType: "simple-editor",
          uploadedVideoUrl: url,
        }),
      });
      const { project } = await projectRes.json();
      setProject(project.id, project.title);
      setUploadProgress(70);

      // 4. Navigate to workspace (analysis runs there)
      router.push(`/dashboard/simple-editor/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      setUploading(false);
      setUploadProgress(0);
      setAnalysisStep("idle");
    }
  }, [setVideo, setProject, setAnalysisStep, router]);

  const handleImportUrl = useCallback(async () => {
    const url = urlInput.trim();
    if (!url) return;
    setError(null);
    setUploading(true);
    setAnalysisStep("uploading");

    try {
      const res = await fetch("/api/editor/import-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error("Could not import that URL. Try downloading the video first.");
      const data = await res.json();
      const videoUrl: string = data.url ?? url;
      const duration: number = data.duration ?? 30;
      setVideo(videoUrl, "", duration);

      const projectRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          title: "Imported Video",
          productType: "simple-editor",
          uploadedVideoUrl: videoUrl,
        }),
      });
      const { project } = await projectRes.json();
      setProject(project.id, project.title);
      router.push(`/dashboard/simple-editor/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      setUploading(false);
      setAnalysisStep("idle");
    }
  }, [urlInput, setVideo, setProject, setAnalysisStep, router]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "#0A0A0F" }}
    >
      {/* Logo/header */}
      <div className="mb-10 text-center">
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-6"
          style={{ background: "rgba(124,58,237,0.15)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.3)" }}
        >
          ✦ AI-Powered Simple Editor
        </div>
        <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">
          Create viral reels in<br />
          <span style={{ color: "#7C3AED" }}>under 2 minutes</span>
        </h1>
        <p className="text-base" style={{ color: "#6b7280" }}>
          Upload your video. AI handles the rest.
        </p>
      </div>

      {/* Upload card */}
      <div
        className="w-full max-w-lg rounded-2xl p-8 transition-all duration-200"
        style={{
          background: dragging ? "rgba(124,58,237,0.08)" : "#111118",
          border: `2px dashed ${dragging ? "#7C3AED" : "rgba(255,255,255,0.1)"}`,
        }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <div
              className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "#7C3AED", borderTopColor: "transparent" }}
            />
            <p className="text-sm font-medium text-white">Uploading your video…</p>
            <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: "rgba(255,255,255,0.08)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${uploadProgress}%`, background: "#7C3AED" }}
              />
            </div>
            <p className="text-xs" style={{ color: "#6b7280" }}>{uploadProgress}%</p>
          </div>
        ) : (
          <>
            {/* Drop zone */}
            <div
              className="flex flex-col items-center gap-4 py-6 cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(124,58,237,0.15)" }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth={1.5} className="w-8 h-8">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round" />
                  <polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-white mb-1">
                  {dragging ? "Drop it here!" : "Drop your video here"}
                </p>
                <p className="text-sm" style={{ color: "#6b7280" }}>
                  or{" "}
                  <span className="font-medium cursor-pointer" style={{ color: "#7C3AED" }}>
                    browse files
                  </span>
                </p>
              </div>
              <div className="flex gap-2">
                {["MP4", "MOV", "WEBM"].map(ext => (
                  <span
                    key={ext}
                    className="text-xs px-2 py-0.5 rounded-md font-medium"
                    style={{ background: "rgba(255,255,255,0.06)", color: "#9ca3af" }}
                  >
                    {ext}
                  </span>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
              <span className="text-xs" style={{ color: "#4b5563" }}>or</span>
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
            </div>

            {/* URL import */}
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="Paste YouTube URL…"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleImportUrl()}
                className="flex-1 rounded-xl px-4 py-3 text-sm outline-none"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#e5e7eb",
                }}
              />
              <button
                onClick={handleImportUrl}
                disabled={!urlInput.trim()}
                className="px-4 py-3 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: urlInput.trim() ? "#7C3AED" : "rgba(124,58,237,0.3)",
                  color: "white",
                  cursor: urlInput.trim() ? "pointer" : "not-allowed",
                }}
              >
                Import
              </button>
            </div>

            {/* Error */}
            {error && (
              <p className="mt-3 text-xs text-center" style={{ color: "#f87171" }}>{error}</p>
            )}
          </>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }}
        />
      </div>

      {/* Feature pills */}
      <div className="flex flex-wrap justify-center gap-2 mt-8 max-w-lg">
        {["✂ Auto silence removal", "✦ AI captions", "⚡ Make Viral", "🔍 Smart zoom", "📊 Reel Score"].map(f => (
          <span
            key={f}
            className="text-xs px-3 py-1.5 rounded-full"
            style={{ background: "rgba(255,255,255,0.04)", color: "#6b7280", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            {f}
          </span>
        ))}
      </div>
    </div>
  );
}

function getVideoDuration(url: string): Promise<number> {
  return new Promise(resolve => {
    const v = document.createElement("video");
    v.src = url;
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve(v.duration || 30);
    v.onerror = () => resolve(30);
    setTimeout(() => resolve(30), 8000);
  });
}
