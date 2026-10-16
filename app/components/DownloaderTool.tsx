"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useJobPolling } from "@/app/components/useJobPolling";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { Button } from "@/app/components/ui/Button";

// The YouTube and Instagram downloader pages (2026-10-14 tools audit). They
// were two near-identical copies; Instagram buffered the whole download inside
// one request with no progress or cancel. Both now start a charged job with a
// POST and poll it (lib/downloader-route.ts).

interface MediaInfo {
  title: string;
  author: string;
  duration: number;
  thumbnail: string;
  viewCount: number;
  likeCount: number;
  formats: { label: string; quality: string }[];
}

export interface DownloaderToolProps {
  slug: "youtube-downloader" | "instagram-downloader";
  title: string;
  /** e.g. "MP4 & MP3". */
  formatsLine: string;
  intro: string;
  urlLabel: string;
  placeholder: string;
  examples: string[];
  /** Platform mark shown in the header tile. */
  icon: React.ReactNode;
  /** Background for the header tile (the platform's own colour). */
  iconBackground: string;
  /** Prefix for the author line ("@" on Instagram). */
  authorPrefix?: string;
  footnote: string;
}

function formatDuration(seconds: number) {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatCount(n: number, suffix: string) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ${suffix}`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K ${suffix}`;
  return `${n} ${suffix}`;
}

function IcDownload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export default function DownloaderTool(props: DownloaderToolProps) {
  const { slug } = props;
  const { user, token, openAuthModal } = useAuth();
  const job = useJobPolling({ toolSlug: slug, token });
  const fireReviewPrompt = useReviewPromptTrigger();
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeQuality, setActiveQuality] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const downloadedForJobId = useRef<string | null>(null);

  async function fetchInfo() {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!user || !token) { openAuthModal("login", props.title); return; }
    setLoading(true);
    setError("");
    setInfo(null);
    try {
      const res = await fetch(`/api/tools/${slug}?url=${encodeURIComponent(trimmed)}&action=info`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Couldn't load this link.");
      setInfo(data as MediaInfo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function download(quality: string) {
    if (!info || !url.trim()) return;
    if (!user || !token) { openAuthModal("login", props.title); return; }
    if (job.status === "processing" || submittingRef.current) return;
    submittingRef.current = true;
    setError("");
    setActiveQuality(quality);
    // One key per click, so a double-click or network retry lands on the
    // same job instead of a second charge.
    const idempotencyKey = crypto.randomUUID();
    try {
      await job.start(async () => {
        const res = await fetch(`/api/tools/${slug}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim(), quality, idempotencyKey }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error ?? "Download failed");
        return data as { jobId: string };
      });
    } finally {
      submittingRef.current = false;
    }
  }

  // Once the job is done, fetch the finished file and hand it to the browser.
  useEffect(() => {
    if (job.status !== "done" || !job.jobId || !token || !info) return;
    if (downloadedForJobId.current === job.jobId) return;
    downloadedForJobId.current = job.jobId;
    fireReviewPrompt("tool_generation_complete", { featureHint: "ai_tools" }).catch(() => { /* non-critical */ });

    (async () => {
      try {
        const res = await fetch(`/api/tools/${slug}?jobId=${job.jobId}&download=1`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Couldn't retrieve the finished download.");
        const blob = await res.blob();
        const ext = activeQuality === "audio" ? "mp3" : "mp4";
        const safeName = info.title.replace(/[^\w\s-]/g, "").trim().substring(0, 60) || "download";
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = `${safeName}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Revoking straight after click() can cancel the download in some
        // browsers — give it time to start.
        setTimeout(() => URL.revokeObjectURL(href), 60_000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Download failed");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.status, job.jobId, token, fireReviewPrompt]);

  const busy = job.status === "processing";

  return (
    <div className="min-h-full bg-surface-2">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: props.iconBackground }}>
            {props.icon}
          </div>
          <div>
            <h1 className="text-[22px] font-extrabold text-fg tracking-tight leading-tight">{props.title}</h1>
            <p className="text-[13px] text-fg-subtle">1 credit per download · No watermark · {props.formatsLine}</p>
          </div>
        </div>

        <p className="text-[13.5px] text-fg-muted mt-3 mb-7">{props.intro}</p>

        <div className="bg-panel rounded-2xl border border-line shadow-sm p-5 mb-5">
          <label htmlFor={`${slug}-url`} className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2 block">
            {props.urlLabel}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id={`${slug}-url`}
              type="url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setInfo(null); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") void fetchInfo(); }}
              placeholder={props.placeholder}
              className="flex-1 bg-surface-1 border border-line rounded-xl px-4 py-2.5 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            />
            <Button type="button" onClick={() => void fetchInfo()} disabled={!url.trim()} loading={loading}>
              {loading ? "Fetching…" : "Get info"}
            </Button>
          </div>
          {!user && <p className="mt-2 text-xs text-fg-subtle">You&apos;ll be asked to sign in to download.</p>}

          {(error || (job.status === "error" && job.error)) && (
            <p role="alert" className="mt-3 text-sm text-error bg-error/10 border border-error/30 rounded-xl px-4 py-2.5">
              {error || job.error}
            </p>
          )}
          {job.status === "cancelled" && (
            <p className="mt-3 text-sm text-fg-muted bg-surface-2 border border-line rounded-xl px-4 py-2.5">
              Cancelled — your credit was refunded.
            </p>
          )}
        </div>

        {info && (
          <div className="bg-panel rounded-2xl border border-line shadow-sm overflow-hidden">
            <div className="flex gap-4 p-5 border-b border-line">
              {info.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={info.thumbnail} alt="" className="w-28 h-20 object-cover rounded-xl flex-shrink-0 bg-surface-3" />
              )}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <h2 className="text-[15px] font-bold text-fg leading-snug line-clamp-2">{info.title}</h2>
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-fg-subtle">
                  {info.author && <span className="text-fg-muted">{props.authorPrefix ?? ""}{info.author}</span>}
                  {info.duration > 0 && <span>{formatDuration(info.duration)}</span>}
                  {info.viewCount > 0 && <span>{formatCount(info.viewCount, "views")}</span>}
                  {info.likeCount > 0 && <span>{formatCount(info.likeCount, "likes")}</span>}
                </div>
              </div>
            </div>

            <div className="p-5">
              <p className="text-xs font-semibold text-fg-subtle uppercase tracking-wide mb-3">Choose a format · 1 credit</p>
              <div className="flex flex-wrap gap-2.5">
                {info.formats.map((fmt) => {
                  const active = busy && activeQuality === fmt.quality;
                  return (
                    <button
                      key={fmt.quality}
                      type="button"
                      onClick={() => void download(fmt.quality)}
                      disabled={busy}
                      aria-busy={active}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors disabled:opacity-50 disabled:cursor-wait outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                        fmt.quality === "audio"
                          ? "bg-primary/10 border-primary/30 text-fg hover:bg-primary/15"
                          : "bg-surface-1 border-line text-fg hover:bg-surface-3 hover:border-line-strong"
                      }`}
                    >
                      <IcDownload />
                      {active ? `Downloading… ${job.progress}%` : fmt.label}
                    </button>
                  );
                })}
              </div>
              {busy && (
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-300" style={{ width: `${job.progress}%` }} />
                  </div>
                  <button type="button" onClick={() => void job.cancel()} className="text-xs font-medium text-fg-subtle hover:text-error transition-colors flex-shrink-0">
                    Cancel
                  </button>
                </div>
              )}
              <p className="text-xs text-fg-subtle mt-4">{props.footnote}</p>
            </div>
          </div>
        )}

        {!info && !loading && (
          <div className="mt-2 bg-panel rounded-2xl border border-line p-5">
            <p className="text-xs font-semibold text-fg-subtle uppercase tracking-wide mb-3">Supported links</p>
            <ul className="space-y-1.5 text-xs text-fg-muted">
              {props.examples.map((ex) => (
                <li key={ex} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                  <span className="font-mono break-all">{ex}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-fg-subtle mt-4">Only download videos you own or have permission to use.</p>
          </div>
        )}
      </div>
    </div>
  );
}
