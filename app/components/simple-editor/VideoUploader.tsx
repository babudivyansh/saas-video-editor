"use client";

import { useRef, useState, DragEvent } from "react";
import type { VideoFile } from "./types";

const ACCEPTED = ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/avi"];
const MAX_MB = 500;

interface Props {
  onVideo: (v: VideoFile) => void;
  token: string;
  disabled?: boolean;
}

function probeVideo(url: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
    v.onerror = () => reject(new Error("Could not read video metadata"));
    v.src = url;
  });
}

export default function VideoUploader({ onVideo, token, disabled }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File) {
    setError("");
    if (!ACCEPTED.includes(file.type) && !file.name.match(/\.(mp4|mov|webm|avi)$/i)) {
      setError("Unsupported format. Please use MP4, MOV, WebM or AVI.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`File exceeds ${MAX_MB} MB limit.`);
      return;
    }

    const url = URL.createObjectURL(file);
    setLoading("Reading video…");
    try {
      const { duration, width, height } = await probeVideo(url);
      onVideo({ file, url, duration, width, height, name: file.name });
    } catch (e) {
      URL.revokeObjectURL(url);
      setError(e instanceof Error ? e.message : "Could not read video");
    } finally {
      setLoading(null);
    }
  }

  async function handleLink() {
    if (!link.trim()) return;
    setError(""); setLoading("Importing link…");
    try {
      const res = await fetch("/api/editor/import-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: link.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Import failed");
      const { videoUrl, durationSec } = d as { videoUrl: string; durationSec: number };
      // Probe width/height from the returned URL
      const meta = await probeVideo(videoUrl).catch(() => ({ duration: durationSec, width: 1280, height: 720 }));
      onVideo({
        file: null,
        url: videoUrl,
        s3Url: videoUrl, // import-link already returns an S3 URL
        duration: durationSec || meta.duration,
        width: meta.width,
        height: meta.height,
        name: link.trim().split("/").pop() || "imported-video",
      });
      setLink("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(null); }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] p-8 gap-6">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !disabled && fileRef.current?.click()}
        className={`w-full max-w-lg border-2 border-dashed rounded-2xl p-16 flex flex-col items-center gap-4 cursor-pointer transition-colors ${
          dragging ? "border-[#7C3AED] bg-[#7C3AED]/10" : "border-white/15 hover:border-[#7C3AED]/50 hover:bg-white/[0.03]"
        } ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        <div className="w-16 h-16 rounded-2xl bg-[#7C3AED]/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-[#7C3AED]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
          </svg>
        </div>
        <div className="text-center">
          {loading ? (
            <p className="text-sm font-semibold text-[#7C3AED] animate-pulse">{loading}</p>
          ) : (
            <>
              <p className="text-sm font-bold text-white">Drag & drop a video here</p>
              <p className="text-xs text-gray-400 mt-1">or click to browse · MP4, MOV, WebM, AVI · up to {MAX_MB} MB</p>
            </>
          )}
        </div>
      </div>

      <input ref={fileRef} type="file" accept="video/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />

      <div className="flex items-center gap-3 w-full max-w-lg text-xs text-gray-500">
        <div className="flex-1 h-px bg-white/10" /> OR <div className="flex-1 h-px bg-white/10" />
      </div>

      {/* Link import */}
      <div className="flex gap-2 w-full max-w-lg">
        <input
          value={link}
          onChange={e => setLink(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLink()}
          placeholder="Paste a YouTube or Instagram URL"
          disabled={!!loading || disabled}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#7C3AED] disabled:opacity-50"
        />
        <button
          onClick={handleLink}
          disabled={!!loading || !link.trim() || disabled}
          className="bg-[#7C3AED] hover:bg-[#6d28d9] disabled:opacity-40 text-white text-sm font-semibold px-5 rounded-xl transition-colors"
        >
          Import
        </button>
      </div>

      {error && <p className="text-sm text-red-400 max-w-lg text-center">{error}</p>}
    </div>
  );
}
