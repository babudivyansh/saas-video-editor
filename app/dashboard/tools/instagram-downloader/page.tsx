"use client";
import { useState } from "react";
import { useAuth } from "@/app/components/AuthContext";

interface PostInfo {
  title: string;
  author: string;
  duration: number;
  thumbnail: string;
  viewCount: number;
  likeCount: number;
  formats: { label: string; quality: string }[];
}

function formatDuration(seconds: number) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatCount(n: number, suffix: string) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ${suffix}`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K ${suffix}`;
  return `${n} ${suffix}`;
}

function IcInstagram() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
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

// Instagram brand gradient (used on accent elements).
const IG_GRADIENT = "linear-gradient(45deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)";

export default function InstagramDownloaderPage() {
  const { token } = useAuth();
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<PostInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  async function fetchInfo() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    setInfo(null);
    try {
      const res = await fetch(
        `/api/tools/instagram-downloader?url=${encodeURIComponent(trimmed)}&action=info`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch post info");
      setInfo(data as PostInfo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function download(quality: string) {
    if (!info || !url.trim()) return;
    setDownloading(quality);
    setError("");
    try {
      const res = await fetch(
        `/api/tools/instagram-downloader?url=${encodeURIComponent(url.trim())}&quality=${encodeURIComponent(quality)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Download failed");
      }
      const blob = await res.blob();
      const ext = quality === "audio" ? "mp3" : "mp4";
      const safeName = info.title.replace(/[^\w\s-]/g, "").trim().substring(0, 60) || "instagram-video";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-1">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0"
              style={{ background: IG_GRADIENT }}
            >
              <IcInstagram />
            </div>
            <div>
              <h1 className="text-[22px] font-extrabold text-gray-900 tracking-tight leading-tight">
                Instagram Downloader
              </h1>
              <p className="text-[13px] text-gray-400">Free · No watermark · Reels, Posts & IGTV</p>
            </div>
          </div>

          <p className="text-[13.5px] text-gray-500 mt-3 mb-7">
            Paste a link to any public Instagram reel, post, or IGTV video to download it in high quality, or extract the audio as MP3.
          </p>

          {/* URL Input */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
              Instagram URL
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={e => { setUrl(e.target.value); setInfo(null); setError(""); }}
                onKeyDown={e => e.key === "Enter" && fetchInfo()}
                placeholder="https://www.instagram.com/reel/..."
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent placeholder-gray-300"
              />
              <button
                onClick={fetchInfo}
                disabled={loading || !url.trim()}
                className="flex items-center gap-2 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-opacity disabled:opacity-50 hover:opacity-90"
                style={{ background: IG_GRADIENT }}
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

            {error && (
              <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
                {error}
              </p>
            )}
          </div>

          {/* Post Info + Download Options */}
          {info && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Thumbnail + meta */}
              <div className="flex gap-4 p-5 border-b border-gray-100">
                {info.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={info.thumbnail}
                    alt={info.title}
                    className="w-20 h-20 object-cover rounded-xl flex-shrink-0 bg-gray-100"
                  />
                )}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <h2 className="text-[15px] font-bold text-gray-900 leading-snug line-clamp-2">
                    {info.title}
                  </h2>
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5">
                    {info.author && <span className="text-xs text-gray-500">@{info.author}</span>}
                    {info.duration > 0 && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-gray-300" />
                        <span className="text-xs text-gray-400">{formatDuration(info.duration)}</span>
                      </>
                    )}
                    {info.viewCount > 0 && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-gray-300" />
                        <span className="text-xs text-gray-400">{formatCount(info.viewCount, "views")}</span>
                      </>
                    )}
                    {info.likeCount > 0 && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-gray-300" />
                        <span className="text-xs text-gray-400">{formatCount(info.likeCount, "likes")}</span>
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
                    const busy = downloading === fmt.quality;
                    return (
                      <button
                        key={fmt.quality}
                        onClick={() => download(fmt.quality)}
                        disabled={downloading !== null}
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
                        {busy ? "Downloading…" : fmt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-4">
                  Only public posts and reels can be downloaded. Do not close this tab while downloading.
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
                  "https://www.instagram.com/reel/...",
                  "https://www.instagram.com/p/...",
                  "https://www.instagram.com/tv/...",
                ].map(ex => (
                  <div key={ex} className="flex items-center gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: IG_GRADIENT }}
                    />
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
