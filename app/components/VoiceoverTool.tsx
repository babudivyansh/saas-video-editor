"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { useJobPolling } from "./useJobPolling";
import { Tooltip } from "@/app/components/ui/Tooltip";

function IcInfo() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>;
}

// ── Voice catalogue ─────────────────────────────────────────────────────────
interface Voice {
  slug: string;
  name: string;
  desc: string;
  gender: "Male" | "Female";
  age: "Young" | "Middle aged" | "Mature";
  language: "English" | "Multilingual";
  color: string; // avatar bg
}

const VOICES: Voice[] = [
  { slug: "william",  name: "William",          desc: "William is the default voice used in Crayo, recommended for most use cases. Great for stories, narration and Reddit.",           gender: "Male",   age: "Middle aged", language: "English",      color: "#ec4899" },
  { slug: "adam",     name: "Adam",              desc: "Adam is the most recognizable voice on TikTok used in many viral videos.",                                                       gender: "Male",   age: "Middle aged", language: "Multilingual", color: "#3b82f6" },
  { slug: "dandan",   name: "Dan Dan",           desc: "The AI voice used in Kimberly Shorts (100k+ yt channel by crayo).",                                                             gender: "Male",   age: "Middle aged", language: "Multilingual", color: "#6366f1" },
  { slug: "natasha",  name: "Natasha",           desc: "Natasha is the soft voice most notably used in TikTok videos for storytelling and narration.",                                   gender: "Female", age: "Young",       language: "Multilingual", color: "#10b981" },
  { slug: "amir1",    name: "Amir #1",           desc: "The one and only built-different sir Uber driver.",                                                                              gender: "Male",   age: "Young",       language: "Multilingual", color: "#f59e0b" },
  { slug: "amir2",    name: "Amir #2 (Ameer)",   desc: "Amir's brother who is rivaling on doordash.",                                                                                   gender: "Male",   age: "Young",       language: "Multilingual", color: "#22c55e" },
  { slug: "daniel",   name: "Daniel",            desc: "Deep, authoritative British voice. Perfect for documentaries, explainers and professional narration.",                           gender: "Male",   age: "Middle aged", language: "English",      color: "#7c3aed" },
  { slug: "harry",    name: "Harry",             desc: "Bold and expressive British voice ideal for dramatic storytelling and gaming content.",                                           gender: "Male",   age: "Young",       language: "English",      color: "#f97316" },
  { slug: "liam",     name: "Liam",              desc: "Energetic and clear American voice. Great for YouTube tutorials, product reviews and everyday content.",                          gender: "Male",   age: "Young",       language: "Multilingual", color: "#0ea5e9" },
  { slug: "charlie",  name: "Charlie",           desc: "Friendly, conversational voice well suited for podcasts, storytelling and casual narration.",                                    gender: "Male",   age: "Young",       language: "Multilingual", color: "#14b8a6" },
  { slug: "thomas",   name: "Thomas",            desc: "Calm and measured voice ideal for educational content, tutorials and e-learning.",                                               gender: "Male",   age: "Middle aged", language: "English",      color: "#8b5cf6" },
  { slug: "matthew",  name: "Matthew",           desc: "Warm American narrator voice with excellent clarity, great for audiobooks and long-form content.",                               gender: "Male",   age: "Middle aged", language: "English",      color: "#06b6d4" },
  { slug: "aria",     name: "Aria",              desc: "Versatile, expressive female voice great for a wide range of content from vlogs to narration.",                                  gender: "Female", age: "Young",       language: "Multilingual", color: "#a855f7" },
  { slug: "rachel",   name: "Rachel",            desc: "Clear, neutral American accent. The go-to voice for professional voiceovers and audiobooks.",                                    gender: "Female", age: "Middle aged", language: "English",      color: "#f43f5e" },
  { slug: "bella",    name: "Bella",             desc: "Soft and soothing voice perfect for meditation guides, calming content and gentle narration.",                                   gender: "Female", age: "Young",       language: "English",      color: "#d946ef" },
  { slug: "charlotte",name: "Charlotte",         desc: "British female voice with natural warmth. Great for storytelling, lifestyle and fashion content.",                               gender: "Female", age: "Middle aged", language: "English",      color: "#7c3aed" },
  { slug: "emily",    name: "Emily",             desc: "Young and lively American voice ideal for social media, vlogs and upbeat narration.",                                            gender: "Female", age: "Young",       language: "English",      color: "#f97316" },
  { slug: "sarah",    name: "Sarah",             desc: "Confident and engaging female voice with a neutral American accent suitable for any topic.",                                     gender: "Female", age: "Young",       language: "English",      color: "#f59e0b" },
  { slug: "matilda",  name: "Matilda",           desc: "Warm and nurturing voice great for educational, kids content and friendly brand voiceovers.",                                    gender: "Female", age: "Middle aged", language: "English",      color: "#22c55e" },
  { slug: "freya",    name: "Freya",             desc: "Dynamic and expressive voice perfect for gaming, entertainment and high-energy content.",                                        gender: "Female", age: "Young",       language: "English",      color: "#10b981" },
  { slug: "grace",    name: "Grace",             desc: "Elegant and articulate voice suited for news-style narration, documentaries and formal content.",                               gender: "Female", age: "Middle aged", language: "English",      color: "#84cc16" },
];

function voiceBySlug(slug: string): Voice {
  return VOICES.find((v) => v.slug === slug) ?? VOICES[0];
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
function IcSwap() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M7 16l-4-4 4-4M3 12h13M17 8l4 4-4 4M21 12H8" /></svg>;
}
function IcGear() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>;
}
function IcWand() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>;
}
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
    <span className="inline-flex items-center rounded-full border border-gray-200 px-2.5 py-0.5 text-[11px] text-gray-500 font-medium">
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
    fetch("/api/tools/voices")
      .then(res => res.json())
      .then((map: Record<string, string>) => {
        cachedPreviewUrls.current = new Map(Object.entries(map));
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <audio ref={previewRef} />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[780px] flex flex-col"
        style={{ maxHeight: "82vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-[17px] font-extrabold text-gray-900">Select AI Voice</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
            <IcX />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 flex-shrink-0">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><IcSearch /></span>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, tag, etc."
              className="w-full rounded-xl border border-gray-200 pl-9 pr-4 py-2.5 text-[13.5px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
            />
          </div>
        </div>

        {/* Voice grid */}
        <div className="overflow-y-auto flex-1 px-6 pb-2">
          {sorted.length === 0 ? (
            <p className="text-[13px] text-gray-400 text-center py-8">No voices match your search.</p>
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
                      isActive ? "border-blue-500 bg-blue-50/40" : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50"
                    }`}
                  >
                    {/* Like + Play buttons */}
                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); onLike(v.slug); }}
                        className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                          isLiked ? "text-red-500 bg-red-50 hover:bg-red-100" : "text-gray-300 hover:text-gray-500 hover:bg-gray-100"
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
                            ? "text-blue-600 bg-blue-100 hover:bg-blue-200"
                            : loadingSlug === v.slug
                              ? "text-blue-400 bg-blue-50"
                              : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
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
                        <p className="text-[13.5px] font-bold text-gray-900 truncate">{v.name}</p>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-[11.5px] text-gray-500 leading-relaxed line-clamp-2 mb-2.5">{v.desc}</p>

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
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-[13.5px] font-bold px-6 py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            Done
            <kbd className="text-[10px] font-semibold bg-white/20 rounded px-1.5 py-0.5">Esc</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Settings popover ─────────────────────────────────────────────────────────
function SettingsPopover({
  exaggeration, setExaggeration,
  stability, setStability,
  similarity, setSimilarity,
  onClose,
}: {
  exaggeration: number; setExaggeration: (v: number) => void;
  stability: number; setStability: (v: number) => void;
  similarity: number; setSimilarity: (v: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute right-0 top-12 z-30 w-80 rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[14px] font-bold text-gray-900">Voice Settings</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 cursor-pointer"><IcX /></button>
      </div>

      {/* Exaggeration */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[13px] font-semibold text-gray-700">Exaggeration</label>
          <span className="text-[12px] font-medium text-gray-500 tabular-nums">{pct(exaggeration)}</span>
        </div>
        <input type="range" min={0} max={1} step={0.01} value={exaggeration}
          onChange={(e) => setExaggeration(Number(e.target.value))}
          className="w-full accent-blue-600 cursor-pointer h-1.5"
        />
      </div>

      {/* Stability */}
      <div className="mb-1.5">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[13px] font-semibold text-gray-700">Stability</label>
          <span className="text-[12px] font-medium text-gray-500 tabular-nums">{pct(stability)}</span>
        </div>
        <input type="range" min={0} max={1} step={0.01} value={stability}
          onChange={(e) => setStability(Number(e.target.value))}
          className="w-full accent-blue-600 cursor-pointer h-1.5"
        />
        <p className="text-[11px] text-gray-400 mt-1.5">Lower values create more varied speech</p>
      </div>

      {/* Similarity */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[13px] font-semibold text-gray-700">Similarity</label>
          <span className="text-[12px] font-medium text-gray-500 tabular-nums">{pct(similarity)}</span>
        </div>
        <input type="range" min={0} max={1} step={0.01} value={similarity}
          onChange={(e) => setSimilarity(Number(e.target.value))}
          className="w-full accent-blue-600 cursor-pointer h-1.5"
        />
        <p className="text-[11px] text-gray-400 mt-1.5">Higher values sound more like the original voice</p>
      </div>
    </div>
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
    <div className="rounded-xl border border-gray-200 bg-white p-3.5 hover:border-gray-300 transition-colors">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggle}
          className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer"
          aria-label={isActive && isPlaying ? "Pause" : "Play"}
        >
          {isActive && isPlaying ? <IcPause /> : <IcPlay />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13.5px] font-semibold text-gray-900 truncate">{item.title}</p>
            <span className="text-[11px] text-gray-400 font-medium flex-shrink-0">{fmtTime(item.durationMs / 1000)}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: v.color }} />
            <span className="text-[11.5px] text-gray-500">{v.name}</span>
          </div>
        </div>
        <a
          href={item.audioUrl}
          download={`${item.title || "voiceover"}.mp3`}
          className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center flex-shrink-0 transition-colors"
          aria-label="Download"
          onClick={(e) => e.stopPropagation()}
        >
          <IcDownload />
        </a>
      </div>
      <div className="mt-3 h-1 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full bg-blue-500 transition-[width] duration-150" style={{ width: `${pctBar}%` }} />
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function VoiceoverTool() {
  const { user, token, openAuthModal, refreshUser } = useAuth();
  const job = useJobPolling({ toolSlug: "voiceover", token });

  const [voiceSlug, setVoiceSlug] = useState("william");
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [exaggeration, setExaggeration] = useState(0.5);
  const [stability, setStability] = useState(0.5);
  const [similarity, setSimilarity] = useState(0.75);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  }, [job.status, job.jobId, job.meta]);

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); if (!busy) generate(); }
  }

  const canGenerate = chars > 0 && chars <= MAX_CHARS && !busy;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-8 pb-12">
      {/* Shared audio for history playback */}
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setProgress((e.target as HTMLAudioElement).currentTime)}
        onEnded={() => { setIsPlaying(false); setProgress(0); }}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      {/* Voice picker modal */}
      {pickerOpen && (
        <VoicePickerModal
          current={voiceSlug}
          liked={liked}
          onSelect={(slug) => { setVoiceSlug(slug); setPickerOpen(false); }}
          onLike={toggleLike}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] gap-6 items-start">
        {/* ── Left: editor ───────────────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          {/* Voice selector row */}
          <div className="flex items-center gap-2 mb-5">
            <button
              onClick={() => { setPickerOpen(true); setSettingsOpen(false); }}
              className="flex-1 flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 hover:border-gray-300 transition-colors cursor-pointer"
            >
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: voice.color }} />
              <span className="text-[14px] font-semibold text-gray-900">{voice.name}</span>
              <span className="text-[12px] text-gray-400">· {voice.gender} · {voice.age}</span>
              <span className="ml-auto text-gray-400"><IcSwap /></span>
            </button>
            <div className="relative">
              <button
                onClick={() => { setSettingsOpen((o) => !o); }}
                className="w-10 h-10 rounded-xl border border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Voice settings"
              >
                <IcGear />
              </button>
              {settingsOpen && (
                <SettingsPopover
                  exaggeration={exaggeration} setExaggeration={setExaggeration}
                  stability={stability} setStability={setStability}
                  similarity={similarity} setSimilarity={setSimilarity}
                  onClose={() => setSettingsOpen(false)}
                />
              )}
            </div>
          </div>

          {/* Title */}
          <label className="block text-[14px] font-bold text-gray-900 mb-1.5">Type your title here</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter a title for your voiceover"
            maxLength={120}
            className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition mb-5"
          />

          {/* Script */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <label className="text-[14px] font-bold text-gray-900">Type your script here</label>
              <Tooltip content="Add punctuation for natural pauses — commas and periods control pacing more than any voice setting.">
                <span className="text-gray-400 cursor-help"><IcInfo /></span>
              </Tooltip>
            </div>
            <span className="text-[12px] text-gray-400 font-medium tabular-nums">{chars} · {fmtTime(estSec)}</span>
          </div>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Enter text here"
            rows={11}
            className="w-full rounded-xl border border-gray-200 px-3.5 py-3 text-[14px] leading-relaxed text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition resize-none"
          />
          {chars > MAX_CHARS && (
            <p className="text-[12px] text-red-500 mt-1.5">Script exceeds the {MAX_CHARS.toLocaleString()} character limit.</p>
          )}
          {error && <p className="text-[12.5px] text-red-500 mt-2">{error}</p>}
          {job.status === "error" && job.error && (
            <p className="text-[12.5px] text-red-500 mt-2">{job.error}</p>
          )}
          {job.status === "cancelled" && (
            <p className="text-[12.5px] text-gray-400 mt-2">Cancelled — your credit was refunded.</p>
          )}

          {/* Generate */}
          <button
            onClick={() => void generate()}
            disabled={!canGenerate}
            className={`mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[14px] font-bold transition-colors ${
              canGenerate ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer" : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            {busy ? (
              <><Spinner /> Generating…</>
            ) : (
              <>
                <IcWand /> Generate voiceover
                <kbd className="ml-1 hidden sm:inline-block text-[11px] font-semibold bg-white/20 rounded px-1.5 py-0.5">⌘+Enter</kbd>
              </>
            )}
          </button>
          {busy && (
            <button
              onClick={() => void job.cancel()}
              className="mt-1.5 w-full text-center text-[12px] font-medium text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}
          {!user && (
            <p className="text-[12px] text-gray-400 mt-2 text-center">You&apos;ll be asked to sign in to generate.</p>
          )}
        </div>

        {/* ── Right: recent voiceovers ───────────────────────────────── */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 min-h-[520px] flex flex-col">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">Recent Voiceovers</h2>
              <p className="text-[12.5px] text-gray-400 mt-0.5">Select and download a script to generate voiceover</p>
            </div>
            {history.length > 0 && (
              <button onClick={() => persistHistory([])} className="text-[12.5px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer">Clear all</button>
            )}
          </div>

          <div className="mt-4 flex-1">
            {busy && history.length === 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-3 text-gray-500">
                <Spinner className="w-5 h-5" /> <span className="text-[13.5px]">Generating your narration…</span>
              </div>
            )}
            {history.length === 0 && !busy ? (
              <div className="h-full min-h-[380px] flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-300 mb-4">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-9 h-9"><path d="M3 10v4M7 6v12M11 3v18M15 7v10M19 10v4M23 11v2" /></svg>
                </div>
                <p className="text-[16px] font-extrabold text-gray-800">No Output Yet</p>
                <p className="text-[13px] text-gray-400 mt-1">First, generate a narration.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {history.map((item) => (
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
        </div>
      </div>
    </div>
  );
}
