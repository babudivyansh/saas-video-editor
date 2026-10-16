"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useJobPolling } from "@/app/components/useJobPolling";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { Button } from "@/app/components/ui/Button";
import { ToolWorkspace, ToolBadge, ToolField, CostRow, Segmented, StageEmpty } from "@/app/components/tools/ToolWorkspace";

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

// The heights lib/downloader-route.ts can deliver (Q_ORDER), plus "best".
const QUALITY_STEPS = [
  ["best", "Best"], ["2160", "4K"], ["1440", "1440p"], ["1080", "1080p"], ["720", "720p"],
  ["480", "480p"], ["360", "360p"], ["240", "240p"], ["144", "144p"],
] as const;

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
  const [format, setFormat] = useState<"video" | "audio">("video");
  const [quality, setQuality] = useState<string | null>(null);
  const [permission, setPermission] = useState(false);
  const [history, setHistory] = useState<{ id: string; title: string; label: string }[]>([]);
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
      setQuality(null);
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
        const label = activeQuality === "audio" ? "MP3" : activeQuality === "best" ? "MP4 · best" : `MP4 · ${activeQuality === "2160" ? "4K" : `${activeQuality}p`}`;
        setHistory((prev) => [{ id: job.jobId!, title: info.title, label }, ...prev].slice(0, 5));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Download failed");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.status, job.jobId, token, fireReviewPrompt]);

  const busy = job.status === "processing";
  const videoFormats = info?.formats.filter((f) => f.quality !== "audio") ?? [];
  const hasAudio = info?.formats.some((f) => f.quality === "audio") ?? false;
  const available = new Set(videoFormats.map((f) => f.quality));
  const selectedQuality = format === "audio" ? "audio" : (quality && (quality === "best" || available.has(quality)) ? quality : "best");
  const maxHeight = videoFormats.reduce((m, f) => Math.max(m, Number(f.quality) || 0), 0);
  const canDownload = !!info && !busy && permission && (format === "audio" ? hasAudio : videoFormats.length > 0 || !hasAudio);

  return (
    <ToolWorkspace
      title={props.title}
      icon={slug === "youtube-downloader" ? "youtube" : "instagram"}
      badges={<ToolBadge>1 credit</ToolBadge>}
      description={props.intro}
      controls={
        <>
          <ToolField label={props.urlLabel}>
            <div className="flex gap-2">
              <input
                id={`${slug}-url`}
                type="url"
                value={url}
                aria-label={props.urlLabel}
                onChange={(e) => { setUrl(e.target.value); setInfo(null); setError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") void fetchInfo(); }}
                placeholder={props.placeholder}
                className="min-w-0 flex-1 rounded-xl border border-line bg-surface-1 px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              />
              <Button type="button" variant="secondary" onClick={() => void fetchInfo()} disabled={!url.trim()} loading={loading}>
                {loading ? "Checking…" : "Check"}
              </Button>
            </div>
          </ToolField>

          {info && (
            <>
              <ToolField label="Format">
                <Segmented label="Format" value={format} onChange={setFormat}
                           options={hasAudio ? ([["video", "MP4 video"], ["audio", "MP3 audio"]] as const) : ([["video", "MP4 video"]] as const)} />
              </ToolField>
              {format === "video" && videoFormats.length > 0 && (
                <ToolField label="Video quality" hint={maxHeight > 0 ? `This one goes up to ${maxHeight >= 2160 ? "4K" : `${maxHeight}p`}` : undefined}>
                  <div role="radiogroup" aria-label="Video quality" className="grid grid-cols-3 gap-1.5 rounded-xl border border-line bg-surface-1 p-1">
                    {QUALITY_STEPS.map(([q, label]) => {
                      const enabled = q === "best" || available.has(q);
                      const on = selectedQuality === q;
                      return (
                        <label key={q} className={`rounded-lg px-2 py-1.5 text-center text-[12.5px] font-semibold transition-colors ${on ? "bg-primary/15 text-fg ring-1 ring-primary/50" : "text-fg-muted hover:text-fg"} ${enabled ? "cursor-pointer" : "pointer-events-none opacity-35"}`}>
                          <input type="radio" name={`${slug}-quality`} value={q} checked={on} disabled={!enabled || busy} onChange={() => setQuality(q)} className="sr-only" />
                          {label}
                        </label>
                      );
                    })}
                  </div>
                  <span className="text-[11.5px] text-fg-subtle">Lower quality downloads faster — same 1 credit.</span>
                </ToolField>
              )}
            </>
          )}

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface-1 px-3.5 py-3">
            <input type="checkbox" checked={permission} onChange={(e) => setPermission(e.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer accent-[var(--primary)]" />
            <span className="text-[12.5px] leading-relaxed text-fg-muted">I own this video or have the creator&apos;s permission to download it.</span>
          </label>
        </>
      }
      footer={
        <>
          {(error || (job.status === "error" && job.error)) && (
            <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-3.5 py-2.5 text-sm text-error">{error || job.error}</p>
          )}
          {job.status === "cancelled" && <p className="text-sm text-fg-muted">Cancelled — your credit was refunded.</p>}
          <CostRow right={user ? `You have ${user.credits.toLocaleString()}` : undefined}>
            <span className="font-semibold text-fg">1 credit</span> · refunded if it fails
          </CostRow>
          <Button type="button" className="w-full" onClick={() => void download(selectedQuality)} disabled={!canDownload} loading={busy}>
            {busy ? `Downloading… ${Math.round(job.progress)}%` : info ? `Download ${format === "audio" ? "MP3" : "MP4"}` : "Check the link first"}
          </Button>
          {!user && <p className="text-center text-xs text-fg-subtle">You&apos;ll be asked to sign in to download.</p>}
          <p className="text-[11.5px] text-fg-subtle">{props.footnote}</p>
        </>
      }
      stageTitle="Download"
      stage={
        info ? (
          <div className="flex flex-1 flex-col gap-4">
            <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface-1 p-4 sm:flex-row">
              {info.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={info.thumbnail} alt="" className="aspect-video w-full flex-shrink-0 rounded-lg bg-surface-3 object-cover sm:w-72" />
              )}
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                <h3 className="line-clamp-2 text-[16px] font-bold leading-snug text-fg">{info.title}</h3>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
                  {info.author && <span className="text-fg-muted">{props.authorPrefix ?? ""}{info.author}</span>}
                  {info.duration > 0 && <span>{formatDuration(info.duration)}</span>}
                  {info.viewCount > 0 && <span>{formatCount(info.viewCount, "views")}</span>}
                  {info.likeCount > 0 && <span>{formatCount(info.likeCount, "likes")}</span>}
                </div>
                <p className="text-[12.5px] text-fg-muted">{format === "audio" ? "MP3 audio" : `MP4 · ${selectedQuality === "best" ? "best available" : selectedQuality === "2160" ? "4K" : `${selectedQuality}p`}`}</p>
              </div>
            </div>
            {busy && (
              <div className="flex flex-col gap-2 rounded-xl border border-primary/40 bg-primary/5 p-4">
                <div className="flex items-center justify-between text-[13px]"><b className="text-fg">Downloading · {Math.round(job.progress)}%</b>
                  <button type="button" onClick={() => void job.cancel()} className="text-xs font-medium text-fg-subtle hover:text-error">Cancel</button>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full bg-primary transition-all duration-300" style={{ width: `${job.progress}%` }} /></div>
                <span className="text-[11.5px] text-fg-subtle">You can leave this page; come back to pick up the file.</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-4">
            <StageEmpty icon={slug === "youtube-downloader" ? "youtube" : "instagram"} title="Paste a link to see the video here">
              You&apos;ll see the title and length, and pick the format and quality, before any credit is used.
            </StageEmpty>
            <div className="rounded-xl border border-line bg-surface-1 p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Supported links</p>
              <ul className="space-y-1.5 text-xs text-fg-muted">
                {props.examples.map((ex) => (
                  <li key={ex} className="flex items-center gap-2"><span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" /><span className="break-all font-mono">{ex}</span></li>
                ))}
              </ul>
            </div>
          </div>
        )
      }
      below={
        history.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Downloaded this session</p>
            <div className="flex flex-col gap-2">
              {history.map((h) => (
                <div key={h.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface-1 p-3 text-[13px]">
                  <span className="min-w-0 flex-1 truncate font-medium text-fg">{h.title}</span>
                  <span className="text-fg-subtle">{h.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : undefined
      }
    />
  );
}
