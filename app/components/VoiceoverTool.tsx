"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { useModKey } from "./useModKey";
import { useJobPolling } from "./useJobPolling";
import { Tooltip } from "@/app/components/ui/Tooltip";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { VOICES, voiceBySlug, type Voice } from "@/app/components/voice-catalog";
import { voiceoverCredits, VOICEOVER_CHARS_PER_CREDIT } from "@/lib/audio-pricing";
import { DEFAULT_VOICE_SLUG } from "@/lib/voices/catalog";
import { Modal } from "@/app/components/ui/Modal";
import { Button } from "@/app/components/ui/Button";
import { ToolWorkspace, ToolBadge, ToolField, CostRow } from "@/app/components/tools/ToolWorkspace";

function IcInfo() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>;
}

// ── History item ────────────────────────────────────────────────────────────
interface HistoryItem {
  id: string;
  title: string;
  voiceSlug: string;
  audioUrl: string;
  durationMs: number;
  characters: number;
  createdAt: number;
}

// Must match the server route's MAX_CHARS (app/api/tools/voiceover/route.ts) —
// letting the client accept more than the server will only means a wasted
// round trip and a confusing late failure instead of an immediate inline one.
const MAX_CHARS = 2000;

// ── Helpers ─────────────────────────────────────────────────────────────────
function estimateSeconds(text: string): number {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return Math.round((words / 150) * 60);
}
function fmtTime(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function pct(val: number) { return `${Math.round(val * 100)}%`; }

// ── Icons ───────────────────────────────────────────────────────────────────
function IcPlay() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M8 5v14l11-7z" /></svg>;
}
function IcPause() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>;
}
function IcDownload() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>;
}
function IcHeart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  );
}
function IcX() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M18 6L6 18M6 6l12 12" /></svg>;
}
function IcSearch() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>;
}
function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>;
}

// ── Voice avatar ─────────────────────────────────────────────────────────────
function VoiceAvatar({ voice, size = 40 }: { voice: Voice; size?: number }) {
  return (
    <span
      className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 select-none"
      style={{ width: size, height: size, background: voice.color, fontSize: size * 0.38 }}
    >
      {voice.name[0]}
    </span>
  );
}

// ── Tag pill ─────────────────────────────────────────────────────────────────
function Tag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line px-2.5 py-0.5 text-[11px] text-fg-muted font-medium">
      {label}
    </span>
  );
}

// ── Voice picker modal ───────────────────────────────────────────────────────
function VoicePickerModal({
  current,
  liked,
  onSelect,
  onLike,
  onClose,
}: {
  current: string;
  liked: Set<string>;
  onSelect: (slug: string) => void;
  onLike: (slug: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  // Cache blob URLs so repeated clicks don't re-fetch
  const blobCache = useRef<Map<string, string>>(new Map());
  // Pre-recorded ElevenLabs preview URLs (slug -> url) — free and instant vs.
  // the live synthesis fallback below, which spends a real ElevenLabs call
  // per click. Fetched once; playPreview prefers this when a slug has one.
  const cachedPreviewUrls = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    fetch("/api/voices")
      .then((res) => res.json())
      .then((d: { voices?: { slug: string; previewUrl: string | null }[] }) => {
        cachedPreviewUrls.current = new Map(
          (d.voices ?? [])
            .filter((v) => v.previewUrl)
            .map((v) => [v.slug, v.previewUrl as string]),
        );
      })
      .catch(() => { /* fall back to live synthesis for every voice */ });
  }, []);

  async function playPreview(slug: string, e: React.MouseEvent) {
    e.stopPropagation();
    const el = previewRef.current;
    if (!el) return;

    // Toggle pause if already playing this voice
    if (previewSlug === slug && !el.paused) {
      el.pause();
      setPreviewSlug(null);
      return;
    }

    const cached = cachedPreviewUrls.current.get(slug);
    if (cached) {
      el.src = cached;
      el.currentTime = 0;
      el.play().catch(() => {});
      setPreviewSlug(slug);
      return;
    }

    // Use cached blob URL if available
    let url = blobCache.current.get(slug);
    if (!url) {
      setLoadingSlug(slug);
      try {
        const res = await fetch("/api/tools/voice-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        });
        if (!res.ok) throw new Error("preview failed");
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
        blobCache.current.set(slug, url);
      } catch {
        setLoadingSlug(null);
        return;
      } finally {
        setLoadingSlug(null);
      }
    }

    el.src = url;
    el.currentTime = 0;
    el.play().catch(() => {});
    setPreviewSlug(slug);
  }

  // Reset previewSlug when audio ends
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const handler = () => setPreviewSlug(null);
    el.addEventListener("ended", handler);
    return () => el.removeEventListener("ended", handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.toLowerCase();
  const filtered = VOICES.filter(
    (v) => !q || v.name.toLowerCase().includes(q) || v.gender.toLowerCase().includes(q) || v.language.toLowerCase().includes(q) || v.age.toLowerCase().includes(q)
  );
  // Liked float to top
  const sorted = [
    ...filtered.filter((v) => liked.has(v.slug)),
    ...filtered.filter((v) => !liked.has(v.slug)),
  ];

  // ui/Modal: Esc, focus trap, scroll lock and a dialog role — the overlay
  // this replaced had none, and its close button had no name.
  return (
    <Modal open onClose={onClose} bare ariaLabel="Select AI voice" maxWidth="max-w-[780px]" panelClassName="!overflow-hidden">
      <audio ref={previewRef} />
      <div className="relative flex flex-col" style={{ maxHeight: "82vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-line flex-shrink-0">
          <h2 className="text-[17px] font-extrabold text-fg">Select AI Voice</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-fg-subtle hover:text-fg transition-colors cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
            <IcX />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 flex-shrink-0">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"><IcSearch /></span>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, tag, etc."
              className="w-full rounded-xl border border-line pl-9 pr-4 py-2.5 text-[13.5px] text-fg placeholder:text-fg-subtle outline-none focus:border-brand/60 focus:ring-2 focus:ring-primary/25 transition"
            />
          </div>
        </div>

        {/* Voice grid */}
        <div className="overflow-y-auto flex-1 px-6 pb-2">
          {sorted.length === 0 ? (
            <p className="text-[13px] text-fg-subtle text-center py-8">No voices match your search.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pb-2">
              {sorted.map((v) => {
                const isActive = v.slug === current;
                const isLiked = liked.has(v.slug);
                const isPreviewing = previewSlug === v.slug;
                return (
                  <div
                    key={v.slug}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(v.slug)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(v.slug); }}}
                    className={`relative rounded-2xl border-2 p-4 text-left transition-all cursor-pointer ${
                      isActive ? "border-brand bg-tint-blue/40" : "border-line bg-panel hover:border-line-strong hover:bg-gray-50/50"
                    }`}
                  >
                    {/* Like + Play buttons */}
                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); onLike(v.slug); }}
                        className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                          isLiked ? "text-error bg-error/10 hover:bg-error/15" : "text-fg-subtle hover:text-fg-muted hover:bg-surface-3"
                        }`}
                        aria-label={isLiked ? "Unlike" : "Like"}
                      >
                        <IcHeart filled={isLiked} />
                      </button>
                      <button
                        onClick={(e) => { if (!loadingSlug) playPreview(v.slug, e); }}
                        disabled={!!loadingSlug && loadingSlug !== v.slug}
                        className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                          isPreviewing
                            ? "text-brand bg-tint-violet hover:bg-tint-violet"
                            : loadingSlug === v.slug
                              ? "text-brand bg-tint-blue"
                              : "text-fg-subtle hover:text-fg hover:bg-surface-3"
                        }`}
                        aria-label="Preview voice"
                      >
                        {loadingSlug === v.slug
                          ? <Spinner className="w-3 h-3" />
                          : isPreviewing
                            ? <IcPause />
                            : <IcPlay />}
                      </button>
                    </div>

                    {/* Avatar + name */}
                    <div className="flex items-center gap-3 mb-2.5 pr-16">
                      <VoiceAvatar voice={v} size={38} />
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-bold text-fg truncate">{v.name}</p>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-[11.5px] text-fg-muted leading-relaxed line-clamp-2 mb-2.5">{v.desc}</p>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1">
                      <Tag label={v.gender} />
                      <Tag label={v.age} />
                      <Tag label={v.language} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-line flex items-center justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-on-primary text-[13.5px] font-bold px-6 py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            Done
            <kbd className="text-[10px] font-semibold bg-white/20 rounded px-1.5 py-0.5">Esc</kbd>
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Player card ──────────────────────────────────────────────────────────────
function PlayerCard({
  item, isActive, isPlaying, progress, onToggle,
}: {
  item: HistoryItem; isActive: boolean; isPlaying: boolean; progress: number; onToggle: () => void;
}) {
  const v = voiceBySlug(item.voiceSlug);
  const pctBar = isActive && item.durationMs > 0 ? Math.min(100, (progress / (item.durationMs / 1000)) * 100) : 0;
  return (
    <div className="rounded-xl border border-line bg-panel p-3.5 hover:border-line-strong transition-colors">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggle}
          className="w-9 h-9 rounded-full bg-brand hover:bg-brand-dark text-on-primary flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer"
          aria-label={isActive && isPlaying ? "Pause" : "Play"}
        >
          {isActive && isPlaying ? <IcPause /> : <IcPlay />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13.5px] font-semibold text-fg truncate">{item.title}</p>
            <span className="text-[11px] text-fg-subtle font-medium flex-shrink-0">{fmtTime(item.durationMs / 1000)}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: v.color }} />
            <span className="text-[11.5px] text-fg-muted">{v.name}</span>
          </div>
        </div>
        <a
          href={item.audioUrl}
          download={`${item.title || "voiceover"}.mp3`}
          className="w-8 h-8 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-3 flex items-center justify-center flex-shrink-0 transition-colors"
          aria-label="Download"
          onClick={(e) => e.stopPropagation()}
        >
          <IcDownload />
        </a>
      </div>
      <div className="mt-3 h-1 rounded-full bg-surface-3 overflow-hidden">
        <div className="h-full bg-brand transition-[width] duration-150" style={{ width: `${pctBar}%` }} />
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function VoiceoverTool() {
  const { user, token, openAuthModal, refreshUser } = useAuth();
  const modKey = useModKey();
  const job = useJobPolling({ toolSlug: "voiceover", token });
  const fireReviewPrompt = useReviewPromptTrigger();

  // DEFAULT_VOICE_SLUG, an offered voice. This was "william" — a retired alias
  // that is not in the picker, so the picker showed its first voice while the
  // request sent "william" (which speaks as Brian): you heard another voice.
  const [voiceSlug, setVoiceSlug] = useState(DEFAULT_VOICE_SLUG);
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [exaggeration, setExaggeration] = useState(0.5);
  const [stability, setStability] = useState(0.5);
  const [similarity, setSimilarity] = useState(0.75);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = job.status === "processing";

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const submittingRef = useRef(false);
  const addedForJobId = useRef<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const voice = voiceBySlug(voiceSlug);
  const chars = script.length;
  const estSec = useMemo(() => estimateSeconds(script), [script]);

  // Storage keys
  const historyKey = user ? `voiceover_history:${user.id}` : "voiceover_history:guest";
  const likedKey   = user ? `voiceover_liked:${user.id}`   : "voiceover_liked:guest";

  // Load history
  useEffect(() => {
    try { setHistory(JSON.parse(localStorage.getItem(historyKey) ?? "[]")); } catch { setHistory([]); }
  }, [historyKey]);

  // Load liked
  useEffect(() => {
    try { setLiked(new Set(JSON.parse(localStorage.getItem(likedKey) ?? "[]"))); } catch { setLiked(new Set()); }
  }, [likedKey]);

  function persistHistory(items: HistoryItem[]) {
    setHistory(items);
    try { localStorage.setItem(historyKey, JSON.stringify(items.slice(0, 20))); } catch {}
  }

  const toggleLike = useCallback((slug: string) => {
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      try { localStorage.setItem(likedKey, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [likedKey]);

  function togglePlay(item: HistoryItem) {
    const el = audioRef.current;
    if (!el) return;
    if (activeId === item.id) {
      if (el.paused) { el.play(); setIsPlaying(true); }
      else { el.pause(); setIsPlaying(false); }
      return;
    }
    el.src = item.audioUrl;
    el.currentTime = 0;
    setActiveId(item.id);
    setProgress(0);
    el.play();
    setIsPlaying(true);
  }

  async function generate() {
    setError(null);
    if (!user || !token) { openAuthModal("login", "AI Voiceover Generator"); return; }
    const text = script.trim();
    if (!text) { setError("Enter a script to generate a voiceover."); return; }
    if (text.length > MAX_CHARS) { setError(`Script is too long (max ${MAX_CHARS} characters).`); return; }
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      const idempotencyKey = crypto.randomUUID();
      await job.start(async () => {
        const res = await fetch("/api/tools/voiceover", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text, voiceId: voiceSlug, title: title.trim(), stability, similarityBoost: similarity, exaggeration, idempotencyKey }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Voice generation failed.");
        return data as { jobId: string };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Voice generation failed.");
    } finally {
      submittingRef.current = false;
    }
  }

  // Once the job is done, pick up the result from job.meta and add it to history.
  useEffect(() => {
    if (job.status !== "done" || !job.jobId) return;
    if (addedForJobId.current === job.jobId) return;
    addedForJobId.current = job.jobId;
    fireReviewPrompt("tool_generation_complete", { featureHint: "ai_tools" }).catch(() => { /* non-critical */ });

    const meta = job.meta as { audioUrl: string; durationMs: number; characters: number; title: string } | null;
    if (!meta) return;
    const item: HistoryItem = {
      id: crypto.randomUUID(),
      title: meta.title || title.trim() || "Untitled voiceover",
      voiceSlug,
      audioUrl: meta.audioUrl,
      durationMs: meta.durationMs ?? 0,
      characters: meta.characters ?? script.trim().length,
      createdAt: Date.now(),
    };
    persistHistory([item, ...history]);
    setTimeout(() => togglePlay(item), 50);
    refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.status, job.jobId, job.meta, fireReviewPrompt]);

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); if (!busy) generate(); }
  }

  const canGenerate = chars > 0 && chars <= MAX_CHARS && !busy;

  return (
    <>
      {/* Shared audio for history playback */}
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setProgress((e.target as HTMLAudioElement).currentTime)}
        onEnded={() => { setIsPlaying(false); setProgress(0); }}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      {pickerOpen && (
        <VoicePickerModal
          current={voiceSlug}
          liked={liked}
          onSelect={(slug) => { setVoiceSlug(slug); setPickerOpen(false); }}
          onLike={toggleLike}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <ToolWorkspace
        title="AI Voiceover"
        icon="mic"
        badges={<ToolBadge>1 credit / {VOICEOVER_CHARS_PER_CREDIT} chars</ToolBadge>}
        description="Turn a script into a natural voiceover."
        controls={
          <>
            <ToolField label="Voice">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface-1 px-3.5 py-3 text-left transition-colors hover:border-line-strong"
              >
                <VoiceAvatar voice={voice} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-fg">{voice.name}</span>
                  <span className="block text-[12px] text-fg-subtle">{voice.gender} · {voice.age}</span>
                </span>
                <span className="text-[12px] font-semibold text-fg-muted">Change</span>
              </button>
            </ToolField>

            <details className="group rounded-xl border border-line bg-surface-1 px-3.5 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[13px] font-semibold text-fg">
                Voice settings
                <span className="text-[12px] font-normal text-fg-subtle group-open:hidden">Exaggeration {pct(exaggeration)} · Stability {pct(stability)}</span>
              </summary>
              <div className="mt-3 flex flex-col gap-4">
                {([
                  ["Exaggeration", exaggeration, setExaggeration, undefined],
                  ["Stability", stability, setStability, "Lower values create more varied speech"],
                  ["Similarity", similarity, setSimilarity, "Higher values sound more like the original voice"],
                ] as const).map(([label, value, set, hint]) => (
                  <label key={label} className="flex flex-col gap-1.5">
                    <span className="flex items-center justify-between text-[12.5px] font-medium text-fg">{label}<span className="tabular-nums text-fg-muted">{pct(value)}</span></span>
                    <input type="range" min={0} max={1} step={0.01} value={value} onChange={(e) => set(Number(e.target.value))} className="h-1.5 w-full cursor-pointer accent-[var(--primary)]" />
                    {hint && <span className="text-[11px] text-fg-subtle">{hint}</span>}
                  </label>
                ))}
              </div>
            </details>
          </>
        }
        footer={
          <>
            {error && <p role="alert" className="text-[12.5px] text-error">{error}</p>}
            {job.status === "error" && job.error && <p role="alert" className="text-[12.5px] text-error">{job.error}</p>}
            {job.status === "cancelled" && <p className="text-[12.5px] text-fg-subtle">Cancelled — your credit was refunded.</p>}
            <CostRow right={user ? `You have ${user.credits.toLocaleString()}` : undefined}>
              {chars > 0 && chars <= MAX_CHARS
                ? <>{chars.toLocaleString()} characters · <span className="font-semibold text-fg">{voiceoverCredits(chars)} credit{voiceoverCredits(chars) === 1 ? "" : "s"}</span></>
                : <>1 credit per {VOICEOVER_CHARS_PER_CREDIT} characters · up to {MAX_CHARS.toLocaleString()}</>}
            </CostRow>
            <Button type="button" className="w-full" onClick={() => void generate()} disabled={!canGenerate} loading={busy}>
              {busy ? "Generating…" : <>Generate voiceover <kbd className="ml-1 hidden rounded bg-black/15 px-1.5 py-0.5 text-[11px] font-semibold sm:inline-block">{modKey}+Enter</kbd></>}
            </Button>
            {busy && (
              <button type="button" onClick={() => void job.cancel()} className="text-center text-[12px] font-medium text-fg-subtle transition-colors hover:text-error">Cancel</button>
            )}
            {!user && <p className="text-center text-[12px] text-fg-subtle">You&apos;ll be asked to sign in to generate.</p>}
          </>
        }
        stageTitle="Script"
        stageActions={
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium tabular-nums text-fg-subtle">
            {chars.toLocaleString()} / {MAX_CHARS.toLocaleString()} · about {fmtTime(estSec)}
            <Tooltip content="Add punctuation for natural pauses — commas and periods control pacing more than any voice setting.">
              <span className="cursor-help"><IcInfo /></span>
            </Tooltip>
          </span>
        }
        stage={
          <div className="flex flex-1 flex-col gap-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional)"
              aria-label="Voiceover title"
              maxLength={120}
              className="w-full rounded-xl border border-line bg-surface-1 px-3.5 py-2.5 text-[14px] text-fg outline-none transition placeholder:text-fg-subtle focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            <div className="flex flex-1 flex-col">
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Type or paste your script. Commas and full stops control the pacing."
                aria-label="Script"
                className="min-h-[300px] w-full flex-1 resize-none rounded-xl border border-line bg-surface-1 px-4 py-3.5 text-[16px] leading-relaxed text-fg outline-none transition placeholder:text-fg-subtle focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
            </div>
            {chars > MAX_CHARS && <p className="text-[12px] text-error">Script exceeds the {MAX_CHARS.toLocaleString()} character limit.</p>}
          </div>
        }
        below={
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Recent takes</p>
              {history.length > 0 && (
                <button type="button" onClick={() => persistHistory([])} className="text-[12px] font-medium text-fg-muted hover:text-fg">Clear list</button>
              )}
            </div>
            {busy && (
              <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-1 p-3.5 text-fg-muted">
                <Spinner className="h-5 w-5" /> <span className="text-[13.5px]">Generating your narration…</span>
              </div>
            )}
            {history.length === 0 && !busy ? (
              <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-fg-subtle">Your voiceovers will be listed here, ready to play and download. They&apos;re also saved to Assets.</p>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {history.slice(0, 6).map((item) => (
                  <PlayerCard
                    key={item.id}
                    item={item}
                    isActive={activeId === item.id}
                    isPlaying={isPlaying}
                    progress={progress}
                    onToggle={() => togglePlay(item)}
                  />
                ))}
              </div>
            )}
          </div>
        }
      />
    </>
  );
}
