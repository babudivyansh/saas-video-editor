"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { useModKey } from "./useModKey";
import { useJobPolling } from "./useJobPolling";
import { Tooltip } from "@/app/components/ui/Tooltip";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { voiceoverCredits, VOICEOVER_CHARS_PER_CREDIT, VOICEOVER_STUDIO_CHARS_PER_CREDIT, type VoiceoverQuality } from "@/lib/audio-pricing";
import { AUTO_LANGUAGE, TTS_LANGUAGES, VOICEOVER_MAX_CHARS, estimateSpokenSeconds, ttsLanguageLabel } from "@/lib/voices/models";
import { DEFAULT_VOICE_SLUG } from "@/lib/voices/catalog";
import { Button } from "@/app/components/ui/Button";
import { ToolWorkspace, ToolBadge, ToolField, CostRow, OptionCards } from "@/app/components/tools/ToolWorkspace";
import { useVoiceCatalog, type CatalogVoice } from "@/app/components/voices/useVoiceCatalog";
import VoiceLibraryPicker, { VoiceAvatar, voiceLanguageLabel } from "@/app/components/voices/VoiceLibraryPicker";

function IcInfo() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>;
}

// ── A take: a finished voiceover, as Assets stores it ───────────────────────
// Read from Assets rather than localStorage (where they used to live), so a
// take made on another device, or before clearing site data, still shows.
interface Take {
  id: string;
  name: string;
  url: string;
  /** Seconds. */
  duration: number | null;
}

// The same constant the route enforces (lib/voices/models.ts) — letting the
// client accept more than the server will only means a wasted round trip and
// a confusing late failure instead of an immediate inline one.
const MAX_CHARS = VOICEOVER_MAX_CHARS;

// ── Helpers ─────────────────────────────────────────────────────────────────
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
function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>;
}

// ── Player card ──────────────────────────────────────────────────────────────
function PlayerCard({
  take, isActive, isPlaying, progress, onToggle,
}: {
  take: Take; isActive: boolean; isPlaying: boolean; progress: number; onToggle: () => void;
}) {
  const pctBar = isActive && take.duration ? Math.min(100, (progress / take.duration) * 100) : 0;
  return (
    <div className="rounded-xl border border-line bg-panel p-3.5 hover:border-line-strong transition-colors">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggle}
          className="w-9 h-9 rounded-full bg-brand hover:bg-brand-dark text-on-primary flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer"
          aria-label={isActive && isPlaying ? `Pause ${take.name}` : `Play ${take.name}`}
        >
          {isActive && isPlaying ? <IcPause /> : <IcPlay />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13.5px] font-semibold text-fg truncate">{take.name.replace(/\.mp3$/i, "")}</p>
            {take.duration != null && <span className="text-[11px] text-fg-subtle font-medium flex-shrink-0">{fmtTime(take.duration)}</span>}
          </div>
        </div>
        <a
          href={take.url}
          download={take.name}
          className="w-8 h-8 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-3 flex items-center justify-center flex-shrink-0 transition-colors"
          aria-label={`Download ${take.name}`}
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
  // Live: the account's voices plus the Voice Library ones, with admin
  // overrides. The page used to render a compiled-in list of 22, so a voice
  // added or hidden in /admin never reached it.
  const catalog = useVoiceCatalog();

  const [voiceSlug, setVoiceSlug] = useState(DEFAULT_VOICE_SLUG);
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [language, setLanguage] = useState(AUTO_LANGUAGE);
  const [quality, setQuality] = useState<VoiceoverQuality>("standard");
  const [stability, setStability] = useState(0.5);
  const [similarity, setSimilarity] = useState(0.75);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = job.status === "processing";

  const [takes, setTakes] = useState<Take[] | null>(null);
  const [takesKey, setTakesKey] = useState(0);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const submittingRef = useRef(false);
  const handledJobId = useRef<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const voice: CatalogVoice | undefined = catalog.voices.find((v) => v.slug === voiceSlug) ?? catalog.voices[0];
  const chars = script.length;
  const estSec = useMemo(() => estimateSpokenSeconds(script, language), [script, language]);
  const cost = voiceoverCredits(chars, quality, voice?.creditMultiplier ?? 1);

  // Favourites stay per-browser: a convenience, not something to sync.
  const likedKey = user ? `voiceover_liked:${user.id}` : "voiceover_liked:guest";
  useEffect(() => {
    try { setLiked(new Set(JSON.parse(localStorage.getItem(likedKey) ?? "[]"))); } catch { setLiked(new Set()); }
  }, [likedKey]);

  const toggleLike = useCallback((slug: string) => {
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      try { localStorage.setItem(likedKey, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [likedKey]);

  useEffect(() => {
    if (!token) return;
    let live = true;
    fetch("/api/assets?source=voiceover&limit=6&excludeFlagged=true", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : { assets: [] }))
      .then((d: { assets?: Take[] }) => { if (live) setTakes(d.assets ?? []); })
      .catch(() => { if (live) setTakes([]); });
    return () => { live = false; };
  }, [token, takesKey]);

  const togglePlay = useCallback((take: Take) => {
    const el = audioRef.current;
    if (!el) return;
    if (activeId === take.id) {
      if (el.paused) void el.play(); else el.pause();
      return;
    }
    el.src = take.url;
    el.currentTime = 0;
    setActiveId(take.id);
    setProgress(0);
    void el.play().catch(() => {});
  }, [activeId]);

  function chooseVoice(v: CatalogVoice) {
    setVoiceSlug(v.slug);
    // A Voice Library voice speaks one language: read the script in it, rather
    // than leave auto-detect to guess from a few words.
    if (v.category === "library" && language === AUTO_LANGUAGE && v.languages[0]) setLanguage(v.languages[0]);
    setPickerOpen(false);
  }

  async function generate() {
    setError(null);
    if (!user || !token) { openAuthModal("login", "AI Voiceover Generator"); return; }
    const text = script.trim();
    if (!text) { setError("Enter a script to generate a voiceover."); return; }
    if (text.length > MAX_CHARS) { setError(`Script is too long (max ${MAX_CHARS.toLocaleString()} characters).`); return; }
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      const idempotencyKey = crypto.randomUUID();
      await job.start(async () => {
        const res = await fetch("/api/tools/voiceover", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text, voiceId: voiceSlug, title: title.trim(), stability, similarityBoost: similarity, language, quality, idempotencyKey }),
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

  // Once the job is done: play the new take, then refresh the list from Assets
  // (the route saved it there).
  useEffect(() => {
    if (job.status !== "done" || !job.jobId || handledJobId.current === job.jobId) return;
    handledJobId.current = job.jobId;
    fireReviewPrompt("tool_generation_complete", { featureHint: "ai_tools" }).catch(() => { /* non-critical */ });
    const meta = job.meta as { audioUrl: string; durationMs: number; title: string } | null;
    if (meta) {
      const el = audioRef.current;
      if (el) { el.src = meta.audioUrl; el.currentTime = 0; void el.play().catch(() => {}); }
      setActiveId(null);
    }
    setTakesKey((k) => k + 1);
    refreshUser();
  }, [job.status, job.jobId, job.meta, fireReviewPrompt, refreshUser]);

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); if (!busy) void generate(); }
  }

  const canGenerate = chars > 0 && chars <= MAX_CHARS && !busy;
  const rate = quality === "studio" ? VOICEOVER_STUDIO_CHARS_PER_CREDIT : VOICEOVER_CHARS_PER_CREDIT;

  return (
    <>
      {/* Shared audio for take playback */}
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setProgress((e.target as HTMLAudioElement).currentTime)}
        onEnded={() => { setIsPlaying(false); setProgress(0); }}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      <VoiceLibraryPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        voices={catalog.voices}
        value={voiceSlug}
        onSelect={chooseVoice}
        language={language}
        favourites={liked}
        onToggleFavourite={toggleLike}
      />

      <ToolWorkspace
        title="AI Voiceover"
        icon="mic"
        badges={<ToolBadge>1 credit / {VOICEOVER_CHARS_PER_CREDIT} chars</ToolBadge>}
        description="Turn a script into a natural voiceover in 94 languages."
        stageFirstOnMobile
        controls={
          <>
            {!catalog.configured && (
              <p role="alert" className="rounded-xl border border-tint-amber-border bg-tint-amber px-3.5 py-2.5 text-[12.5px] text-fg">
                Voice generation isn&apos;t available right now. Please try again later.
              </p>
            )}
            <ToolField label="Voice">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                aria-haspopup="dialog"
                className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface-1 px-3.5 py-3 text-left transition-colors hover:border-line-strong"
              >
                {voice && <VoiceAvatar voice={voice} size={34} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-fg">{voice?.label ?? "Choose a voice"}</span>
                  {voice && <span className="block truncate text-[12px] text-fg-subtle">{voiceLanguageLabel(voice)}{voice.gender !== "neutral" ? ` · ${voice.gender === "female" ? "Female" : "Male"}` : " · Neutral"}</span>}
                </span>
                <span className="text-[12px] font-semibold text-fg-muted">Change</span>
              </button>
            </ToolField>

            <ToolField label="Language" hint="Auto-detect reads the script's own language. Pick one to fix the accent and pronunciation.">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                aria-label="Language"
                className="w-full rounded-xl border border-line bg-surface-1 px-3.5 py-2.5 text-[14px] text-fg outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
              >
                <option value={AUTO_LANGUAGE}>Auto-detect</option>
                {TTS_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
              {voice?.category === "library" && language !== AUTO_LANGUAGE && !voice.languages.includes(language) && (
                <span className="mt-1.5 block text-[11.5px] text-fg-subtle">
                  {voice.label} is a {ttsLanguageLabel(voice.languages[0] ?? "")} voice; reading {ttsLanguageLabel(language)} it will keep that accent.
                </span>
              )}
            </ToolField>

            <ToolField label="Quality">
              <OptionCards
                name="voiceover-quality"
                value={quality}
                onChange={setQuality}
                options={[
                  ["standard", "Standard", `Fast · 1 credit / ${VOICEOVER_CHARS_PER_CREDIT} chars`],
                  ["studio", "Studio", `Most natural · 1 credit / ${VOICEOVER_STUDIO_CHARS_PER_CREDIT} chars`],
                ] as const}
              />
            </ToolField>

            <details className="group rounded-xl border border-line bg-surface-1 px-3.5 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[13px] font-semibold text-fg">
                Voice settings
                <span className="text-[12px] font-normal text-fg-subtle group-open:hidden">Stability {pct(stability)} · Similarity {pct(similarity)}</span>
              </summary>
              <div className="mt-3 flex flex-col gap-4">
                {([
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
            {job.status === "cancelled" && <p className="text-[12.5px] text-fg-subtle">Cancelled — your credits were refunded.</p>}
            <CostRow right={user ? `You have ${user.credits.toLocaleString()}` : undefined}>
              {chars > 0 && chars <= MAX_CHARS
                ? <>{chars.toLocaleString()} characters · <span className="font-semibold text-fg">{cost} credit{cost === 1 ? "" : "s"}</span></>
                : <>1 credit per {rate} characters · up to {MAX_CHARS.toLocaleString()}</>}
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
              <span className="cursor-help" aria-label="Pacing tip"><IcInfo /></span>
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
                className="min-h-[220px] w-full flex-1 resize-none rounded-xl border border-line bg-surface-1 px-4 py-3.5 text-[16px] leading-relaxed text-fg outline-none transition placeholder:text-fg-subtle focus:border-primary focus:ring-2 focus:ring-primary/25 sm:min-h-[300px]"
              />
            </div>
            {chars > MAX_CHARS && <p role="alert" className="text-[12px] text-error">Script exceeds the {MAX_CHARS.toLocaleString()} character limit.</p>}
          </div>
        }
        below={
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Recent takes</p>
            {busy && (
              <div role="status" className="flex items-center gap-3 rounded-xl border border-line bg-surface-1 p-3.5 text-fg-muted">
                <Spinner className="h-5 w-5" /> <span className="text-[13.5px]">Generating your narration…</span>
              </div>
            )}
            {!takes?.length && !busy ? (
              <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-fg-subtle">Your voiceovers will be listed here, ready to play and download. They&apos;re also saved to Assets.</p>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {(takes ?? []).map((take) => (
                  <PlayerCard
                    key={take.id}
                    take={take}
                    isActive={activeId === take.id}
                    isPlaying={isPlaying}
                    progress={progress}
                    onToggle={() => togglePlay(take)}
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
