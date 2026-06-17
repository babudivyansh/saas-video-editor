"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";

// ── Voice catalogue ─────────────────────────────────────────────────────────
// slug must exist in utils/voice-ids.ts VOICE_ID_MAP.
interface Voice {
  slug: string;
  name: string;
  gender: "Male" | "Female";
  accent: string;
  color: string;
}
const VOICES: Voice[] = [
  { slug: "william", name: "William", gender: "Male", accent: "American", color: "#ec4899" },
  { slug: "adam", name: "Adam", gender: "Male", accent: "American", color: "#3b82f6" },
  { slug: "daniel", name: "Daniel", gender: "Male", accent: "British", color: "#6366f1" },
  { slug: "charlie", name: "Charlie", gender: "Male", accent: "American", color: "#14b8a6" },
  { slug: "liam", name: "Liam", gender: "Male", accent: "American", color: "#0ea5e9" },
  { slug: "matthew", name: "Matthew", gender: "Male", accent: "American", color: "#06b6d4" },
  { slug: "thomas", name: "Thomas", gender: "Male", accent: "American", color: "#8b5cf6" },
  { slug: "rachel", name: "Rachel", gender: "Female", accent: "American", color: "#f43f5e" },
  { slug: "aria", name: "Aria", gender: "Female", accent: "American", color: "#a855f7" },
  { slug: "bella", name: "Bella", gender: "Female", accent: "American", color: "#d946ef" },
  { slug: "charlotte", name: "Charlotte", gender: "Female", accent: "British", color: "#7c3aed" },
  { slug: "emily", name: "Emily", gender: "Female", accent: "American", color: "#f97316" },
  { slug: "sarah", name: "Sarah", gender: "Female", accent: "American", color: "#f59e0b" },
  { slug: "matilda", name: "Matilda", gender: "Female", accent: "American", color: "#22c55e" },
  { slug: "freya", name: "Freya", gender: "Female", accent: "American", color: "#10b981" },
  { slug: "grace", name: "Grace", gender: "Female", accent: "American", color: "#84cc16" },
];

interface HistoryItem {
  id: string;
  title: string;
  voiceSlug: string;
  audioUrl: string;
  durationMs: number;
  characters: number;
  createdAt: number;
}

const MAX_CHARS = 5000;

// ── Helpers ─────────────────────────────────────────────────────────────────
function estimateSeconds(text: string): number {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return Math.round((words / 150) * 60); // ~150 words per minute
}
function fmtTime(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
function voiceBySlug(slug: string): Voice {
  return VOICES.find((v) => v.slug === slug) ?? VOICES[0];
}

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
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M8 5v14l11-7z" /></svg>;
}
function IcPause() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>;
}
function IcDownload() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>;
}
function IcCheck() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M20 6L9 17l-5-5" /></svg>;
}
function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>;
}
function VoiceDot({ color, size = 12 }: { color: string; size?: number }) {
  return <span className="inline-block rounded-full flex-shrink-0" style={{ width: size, height: size, background: color }} />;
}

// ── Audio player (single shared element, one item active at a time) ──────────
function PlayerCard({
  item,
  isActive,
  isPlaying,
  progress,
  onToggle,
}: {
  item: HistoryItem;
  isActive: boolean;
  isPlaying: boolean;
  progress: number;
  onToggle: () => void;
}) {
  const v = voiceBySlug(item.voiceSlug);
  const pct = isActive && item.durationMs > 0 ? Math.min(100, (progress / (item.durationMs / 1000)) * 100) : 0;
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
            <VoiceDot color={v.color} size={8} />
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
        <div className="h-full bg-blue-500 transition-[width] duration-150" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function VoiceoverTool() {
  const { user, token, openAuthModal } = useAuth();

  const [voiceSlug, setVoiceSlug] = useState("william");
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [stability, setStability] = useState(0.5);
  const [similarity, setSimilarity] = useState(0.75);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);

  // shared audio element
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const voice = voiceBySlug(voiceSlug);
  const chars = script.length;
  const estSec = useMemo(() => estimateSeconds(script), [script]);

  // Load / persist history (scoped per user)
  const storageKey = user ? `voiceover_history:${user.id}` : "voiceover_history:guest";
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setHistory(raw ? (JSON.parse(raw) as HistoryItem[]) : []);
    } catch {
      setHistory([]);
    }
  }, [storageKey]);
  function persist(items: HistoryItem[]) {
    setHistory(items);
    try {
      localStorage.setItem(storageKey, JSON.stringify(items.slice(0, 20)));
    } catch {
      /* ignore quota */
    }
  }

  function togglePlay(item: HistoryItem) {
    const el = audioRef.current;
    if (!el) return;
    if (activeId === item.id) {
      if (el.paused) {
        el.play();
        setIsPlaying(true);
      } else {
        el.pause();
        setIsPlaying(false);
      }
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
    if (!user || !token) {
      openAuthModal("login");
      return;
    }
    const text = script.trim();
    if (!text) {
      setError("Enter a script to generate a voiceover.");
      return;
    }
    if (text.length > MAX_CHARS) {
      setError(`Script is too long (max ${MAX_CHARS} characters).`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/tools/voiceover", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text, voiceId: voiceSlug, title: title.trim(), stability, similarityBoost: similarity }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Voice generation failed.");
      const item: HistoryItem = {
        id: crypto.randomUUID(),
        title: data.title || title.trim() || "Untitled voiceover",
        voiceSlug,
        audioUrl: data.audioUrl,
        durationMs: data.durationMs ?? 0,
        characters: data.characters ?? text.length,
        createdAt: Date.now(),
      };
      persist([item, ...history]);
      // auto-play the new one
      setTimeout(() => togglePlay(item), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Voice generation failed.");
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (!busy) generate();
    }
  }

  const canGenerate = chars > 0 && chars <= MAX_CHARS && !busy;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-8 pb-12">
      {/* hidden shared audio element */}
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setProgress((e.target as HTMLAudioElement).currentTime)}
        onEnded={() => { setIsPlaying(false); setProgress(0); }}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] gap-6 items-start">
        {/* ── Left: editor ───────────────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          {/* Voice selector row */}
          <div className="flex items-center gap-2 mb-5">
            <button
              onClick={() => { setPickerOpen((o) => !o); setSettingsOpen(false); }}
              className="flex-1 flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 hover:border-gray-300 transition-colors cursor-pointer"
            >
              <VoiceDot color={voice.color} />
              <span className="text-[14px] font-semibold text-gray-900">{voice.name}</span>
              <span className="text-[12px] text-gray-400">· {voice.gender} · {voice.accent}</span>
              <span className="ml-auto text-gray-400"><IcSwap /></span>
            </button>
            <div className="relative">
              <button
                onClick={() => { setSettingsOpen((o) => !o); setPickerOpen(false); }}
                className="w-10 h-10 rounded-xl border border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Voice settings"
              >
                <IcGear />
              </button>
              {settingsOpen && (
                <div className="absolute right-0 top-12 z-30 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
                  <p className="text-[13px] font-bold text-gray-900 mb-3">Voice settings</p>
                  <label className="block text-[12px] font-semibold text-gray-600 mb-1">Stability · {stability.toFixed(2)}</label>
                  <input type="range" min={0} max={1} step={0.05} value={stability} onChange={(e) => setStability(Number(e.target.value))} className="w-full accent-blue-600" />
                  <label className="block text-[12px] font-semibold text-gray-600 mb-1 mt-3">Similarity · {similarity.toFixed(2)}</label>
                  <input type="range" min={0} max={1} step={0.05} value={similarity} onChange={(e) => setSimilarity(Number(e.target.value))} className="w-full accent-blue-600" />
                  <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">Higher stability is more consistent; higher similarity hews closer to the original voice.</p>
                </div>
              )}
            </div>
          </div>

          {/* Voice picker dropdown */}
          {pickerOpen && (
            <div className="mb-5 rounded-xl border border-gray-200 bg-white p-2 max-h-72 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {VOICES.map((v) => {
                  const active = v.slug === voiceSlug;
                  return (
                    <button
                      key={v.slug}
                      onClick={() => { setVoiceSlug(v.slug); setPickerOpen(false); }}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${active ? "bg-blue-50" : "hover:bg-gray-50"}`}
                    >
                      <VoiceDot color={v.color} />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-gray-900 truncate">{v.name}</span>
                        <span className="block text-[11px] text-gray-400">{v.gender} · {v.accent}</span>
                      </span>
                      {active && <span className="ml-auto text-blue-600"><IcCheck /></span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
            <label className="text-[14px] font-bold text-gray-900">Type your script here</label>
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

          {/* Generate */}
          <button
            onClick={generate}
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
              <button onClick={() => persist([])} className="text-[12.5px] font-semibold text-blue-600 hover:text-blue-700">Clear all</button>
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
