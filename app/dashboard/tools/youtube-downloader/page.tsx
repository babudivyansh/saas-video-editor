"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useJobPolling } from "@/app/components/useJobPolling";

interface VideoInfo {
  title: string;
  author: string;
  duration: number;
  thumbnail: string;
  viewCount: number;
  // Matches the server's actual response shape (app/api/tools/youtube-downloader/route.ts) —
  // "mux" means the format needs muxing (real video formats); MP3 doesn't.
  formats: { label: string; quality: string; mux: boolean }[];
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatViews(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} views`;
}

function IcYoutube() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 00.5 6.2 31 31 0 000 12a31 31 0 00.5 5.8 3 3 0 002.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 002.1-2.1A31 31 0 0024 12a31 31 0 00-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" />
    </svg>
  );
}

function IcDownload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IcSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

export default function YouTubeDownloaderPage() {
  const { user, token, openAuthModal } = useAuth();
  const job = useJobPolling({ toolSlug: "youtube-downloader", token });
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeQuality, setActiveQuality] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const downloadedForJobId = useRef<string | null>(null);

  async function fetchInfo() {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!user || !token) { openAuthModal("login", "YouTube Downloader"); return; }
    setLoading(true);
    setError("");
    setInfo(null);
    try {
      const res = await fetch(
        `/api/tools/youtube-downloader?url=${encodeURIComponent(trimmed)}&action=info`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch video info");
      setInfo(data as VideoInfo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function download(quality: string) {
    if (!info || !url.trim()) return;
    if (!user || !token) { openAuthModal("login", "YouTube Downloader"); return; }
    if (job.status === "processing") return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError("");
    setActiveQuality(quality);
    try {
      await job.start(async () => {
        const idempotencyKey = crypto.randomUUID();
        const res = await fetch(
          `/api/tools/youtube-downloader?url=${encodeURIComponent(url.trim())}&quality=${encodeURIComponent(quality)}&idempotencyKey=${idempotencyKey}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error ?? "Download failed");
        return data as { jobId: string };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      submittingRef.current = false;
    }
  }

  // Once the job is done, fetch the finished file and trigger a browser download.
  useEffect(() => {
    if (job.status !== "done" || !job.jobId || !token || !info) return;
    if (downloadedForJobId.current === job.jobId) return;
    downloadedForJobId.current = job.jobId;

    (async () => {
      try {
        const res = await fetch(`/api/tools/youtube-downloader?jobId=${job.jobId}&download=1`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to retrieve the finished download");
        const blob = await res.blob();
        const ext = activeQuality === "audio" ? "mp3" : "mp4";
        const safeName = info.title.replace(/[^\w\s-]/g, "").trim().substring(0, 60) || "video";
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${safeName}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Download failed");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.status, job.jobId, token]);

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto w-full max-w-2xl px-6 py-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center text-white flex-shrink-0">
              <IcYoutube />
            </div>
            <div>
              <h1 className="text-[22px] font-extrabold text-gray-900 tracking-tight leading-tight">
                YouTube Downloader
              </h1>
              <p className="text-[13px] text-gray-400">Free · No watermark · MP4 & MP3</p>
            </div>
          </div>

          <p className="text-[13.5px] text-gray-500 mt-3 mb-7">
            Paste any YouTube URL to download the video in your preferred quality, or extract the audio as MP3.
          </p>

          {/* URL Input */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
              YouTube URL
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={e => { setUrl(e.target.value); setInfo(null); setError(""); }}
                onKeyDown={e => e.key === "Enter" && fetchInfo()}
                placeholder="https://www.youtube.com/watch?v=..."
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent placeholder-gray-300"
              />
              <button
                onClick={fetchInfo}
                disabled={loading || !url.trim()}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                {loading ? (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                ) : (
                  <IcSearch />
                )}
                {loading ? "Fetching…" : "Get Info"}
              </button>
            </div>
            {!user && (
              <p className="mt-2 text-xs text-gray-400 text-center">You&apos;ll be asked to sign in to download.</p>
            )}

            {error && (
              <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
                {error}
              </p>
            )}
            {job.status === "error" && job.error && (
              <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
                {job.error}
              </p>
            )}
            {job.status === "cancelled" && (
              <p className="mt-3 text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5">
                Cancelled — your credit was refunded.
              </p>
            )}
          </div>

          {/* Video Info + Download Options */}
          {info && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Thumbnail + meta */}
              <div className="flex gap-4 p-5 border-b border-gray-100">
                {info.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={info.thumbnail}
                    alt={info.title}
                    className="w-36 h-20 object-cover rounded-xl flex-shrink-0 bg-gray-100"
                  />
                )}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <h2 className="text-[15px] font-bold text-gray-900 leading-snug line-clamp-2">
                    {info.title}
                  </h2>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs text-gray-500">{info.author}</span>
                    <span className="w-1 h-1 rounded-full bg-gray-300" />
                    <span className="text-xs text-gray-400">{formatDuration(info.duration)}</span>
                    {info.viewCount > 0 && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-gray-300" />
                        <span className="text-xs text-gray-400">{formatViews(info.viewCount)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Download buttons */}
              <div className="p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Choose Format
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {info.formats.map(fmt => {
                    const isAudio = fmt.quality === "audio";
                    const busy = job.status === "processing" && activeQuality === fmt.quality;
                    return (
                      <button
                        key={fmt.quality}
                        onClick={() => void download(fmt.quality)}
                        disabled={job.status === "processing"}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all disabled:opacity-50 disabled:cursor-wait ${
                          isAudio
                            ? "bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
                            : "bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100 hover:border-gray-300"
                        }`}
                      >
                        {busy ? (
                          <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                        ) : (
                          <IcDownload />
                        )}
                        {busy ? `Downloading… ${job.progress}%` : fmt.label}
                      </button>
                    );
                  })}
                </div>
                {job.status === "processing" && (
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${job.progress}%` }} />
                    </div>
                    <button
                      onClick={() => void job.cancel()}
                      className="text-xs font-medium text-gray-400 hover:text-red-600 transition-colors flex-shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-4">
                  Large videos may take a moment to download. Do not close this tab while downloading.
                </p>
              </div>
            </div>
          )}

          {/* Tips */}
          {!info && !loading && (
            <div className="mt-2 bg-white rounded-2xl border border-gray-100 p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Supported URLs</p>
              <div className="space-y-1.5 text-xs text-gray-500">
                {[
                  "https://www.youtube.com/watch?v=...",
                  "https://youtu.be/...",
                  "https://youtube.com/shorts/...",
                ].map(ex => (
                  <div key={ex} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                    <span className="font-mono">{ex}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
    </div>
  );
}
