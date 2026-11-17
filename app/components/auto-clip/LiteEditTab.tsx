"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { Switch } from "@/app/components/ui/Switch";
import { ClipScrubber } from "./ClipScrubber";
import { clientAuthToken } from "@/lib/client-session";

// The "Edit" tab of the clip panel: trim, speed, music bed, fades — and a
// preview of what the render will actually look like.
//
// Every control here takes effect on its own: a click (or letting go of a
// slider) saves the change and re-renders the clip. There used to be an
// "Apply Edits" button at the bottom, so every change was set → scroll → apply.
// Changes made in quick succession are still sent as one request (the parent
// debounces), so dragging a slider is one render, not twenty.

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export interface LiteEdits {
  v: 1;
  speed?: number;
  music?: { url: string; title?: string; attribution?: string; volume: number; startSec: number; duck: boolean };
  transition?: { fadeInSec?: number; fadeOutSec?: number };
}

// The stock search (Jamendo) returns `name`; this read `title`, so every
// result was listed as "Untitled" and saved as "Selected track".
interface StockAudioItem { id: string; name?: string; title?: string; previewUrl?: string; downloadUrl: string; durationSec?: number; attribution?: string }
const trackName = (r: StockAudioItem) => r.name ?? r.title ?? "Untitled";
export interface PreviewFrame { atSec: number; dataUrl: string }

/** How long to wait after a change before saving it: a click saves fast, a drag waits for the user to settle. */
export const COMMIT_DELAY = { click: 500, drag: 900 } as const;

export interface LiteEditTabProps {
  projectId: string;
  clipId: string;
  /** Length of the clip's window in the SOURCE, seconds (endSec - startSec). Trim works in this. */
  windowSec: number;
  peaks: number[];
  initial: LiteEdits | null;
  /** Price of the next re-render, e.g. "free" or "1 credit". */
  priceLabel: string;
  /** Save state of this tab's changes, shown under the controls. */
  statusText: string | null;
  error: string | null;
  /** Called on every change; the parent saves it and re-renders. */
  onCommit: (edits: LiteEdits, trim: { startSec: number; endSec: number } | null, delayMs: number) => void;
}

interface State {
  speed: number;
  fadeIn: number;
  fadeOut: number;
  music: LiteEdits["music"] | undefined;
  trimStart: number;
  trimEnd: number;
}

export function toLiteEdits(s: Pick<State, "speed" | "fadeIn" | "fadeOut" | "music">): LiteEdits {
  return {
    v: 1,
    ...(s.speed !== 1 ? { speed: s.speed } : {}),
    ...(s.music ? { music: s.music } : {}),
    ...(s.fadeIn > 0 || s.fadeOut > 0
      ? { transition: { ...(s.fadeIn > 0 ? { fadeInSec: s.fadeIn } : {}), ...(s.fadeOut > 0 ? { fadeOutSec: s.fadeOut } : {}) } }
      : {}),
  };
}

export function LiteEditTab({
  projectId, clipId, windowSec, peaks, initial, priceLabel, statusText, error: commitError, onCommit,
}: LiteEditTabProps) {
  const [s, setS] = useState<State>(() => ({
    speed: initial?.speed ?? 1,
    fadeIn: initial?.transition?.fadeInSec ?? 0,
    fadeOut: initial?.transition?.fadeOutSec ?? 0,
    music: initial?.music,
    trimStart: 0,
    trimEnd: windowSec,
  }));

  // Trim is relative to the clip's window. Once a trim has rendered, the
  // window itself has moved, so the handles go back to "the whole clip".
  // (Only the end used to reset, so the start handle stayed where it was and
  // the next change trimmed the already-trimmed clip again.)
  const [seenWindow, setSeenWindow] = useState(windowSec);
  if (seenWindow !== windowSec) {
    setSeenWindow(windowSec);
    setS((p) => ({ ...p, trimStart: 0, trimEnd: windowSec }));
  }

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockAudioItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [frames, setFrames] = useState<PreviewFrame[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One click to hear a track before using it; there was no way to listen.
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { audioRef.current?.pause(); }, []);
  function togglePlay(r: StockAudioItem) {
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    if (playingId === r.id) { a.pause(); setPlayingId(null); return; }
    a.src = r.previewUrl ?? r.downloadUrl;
    a.onended = () => setPlayingId(null);
    void a.play().then(() => setPlayingId(r.id)).catch(() => setError("Couldn't play that track."));
  }

  const authHeaders = useCallback((): Record<string, string> => {
    const token = clientAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const trimOf = (n: State) =>
    n.trimStart > 0.05 || n.trimEnd < windowSec - 0.05 ? { startSec: n.trimStart, endSec: n.trimEnd } : null;

  /** Apply a change locally and hand it to the parent to save. */
  function change(patch: Partial<State>, delayMs: number) {
    const next = { ...s, ...patch };
    setS(next);
    onCommit(toLiteEdits(next), trimOf(next), delayMs);
    setFrames(null);
  }

  async function searchMusic() {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/editor/stock/search?type=audio&q=${encodeURIComponent(query)}`, { headers: authHeaders() });
      const data = await res.json();
      setResults(Array.isArray(data.items) ? data.items.slice(0, 6) : []);
      if (!res.ok) setError(data.error ?? "Music search is unavailable right now.");
      else if (!data.items?.length) setError("No tracks matched — try another word.");
    } catch {
      setError("Music search is unavailable right now.");
    } finally {
      setSearching(false);
    }
  }

  async function loadPreview() {
    setPreviewing(true);
    setError(null);
    try {
      const trim = trimOf(s);
      const res = await fetch(`/api/projects/${projectId}/clips/${clipId}/preview-frames`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ liteEdits: toLiteEdits(s), ...(trim ?? {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      setFrames(data.frames ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  const shown = error ?? commitError;

  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-surface px-3 py-2 text-[11px] text-ink-soft">
        Changes apply as you make them and re-render the clip — <span className="font-semibold text-ink">{priceLabel}</span>.
      </p>

      <div>
        <h4 className="text-xs font-bold text-ink uppercase tracking-wider mb-2">Trim</h4>
        <ClipScrubber
          peaks={peaks}
          durationSec={windowSec}
          startSec={s.trimStart}
          endSec={s.trimEnd}
          onChange={({ startSec, endSec }) => change({ trimStart: startSec, trimEnd: endSec }, COMMIT_DELAY.drag)}
        />
      </div>

      <div>
        <h4 className="text-xs font-bold text-ink uppercase tracking-wider mb-2">Speed</h4>
        <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label="Speed">
          {SPEEDS.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={s.speed === v}
              onClick={() => { if (s.speed !== v) change({ speed: v }, COMMIT_DELAY.click); }}
              className={`rounded-lg border py-1.5 text-[11px] font-semibold transition-colors ${
                s.speed === v ? "grad-brand text-on-primary shadow-glow border-transparent" : "bg-panel border-card-border text-ink-soft hover:bg-tint-blue"
              }`}
            >
              {v}×
            </button>
          ))}
        </div>
        {s.speed !== 1 && (
          <p className="text-[10px] text-ink-soft mt-1.5">
            Clip becomes {((s.trimEnd - s.trimStart) / s.speed).toFixed(1)}s. Captions and framing follow automatically.
          </p>
        )}
      </div>

      <div>
        <h4 className="text-xs font-bold text-ink uppercase tracking-wider mb-2">Music bed</h4>
        {s.music ? (
          <div className="rounded-lg border border-card-border p-3 space-y-2 bg-panel">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-ink truncate">{s.music.title ?? "Selected track"}</p>
              <button type="button" onClick={() => change({ music: undefined }, COMMIT_DELAY.click)} className="text-[11px] text-ink-soft hover:text-ink">Remove</button>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-ink-soft">
                <span>Volume</span><span>{Math.round(s.music.volume * 100)}%</span>
              </div>
              <input
                type="range" min={0} max={0.6} step={0.02} value={s.music.volume}
                aria-label="Music volume"
                onChange={(e) => change({ music: { ...s.music!, volume: Number(e.target.value) } }, COMMIT_DELAY.drag)}
                className="w-full h-1 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-brand"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-[11px] font-semibold text-ink block">Duck under speech</label>
                <span className="text-[10px] text-ink-soft">Music drops while someone is talking.</span>
              </div>
              <Switch checked={s.music.duck} onChange={(v) => change({ music: { ...s.music!, duck: v } }, COMMIT_DELAY.click)} label="Duck under speech" />
            </div>
            {/* Jamendo's licence requires the artist to be credited. */}
            {s.music.attribution && <p className="text-[9px] text-ink-soft/80 leading-tight">{s.music.attribution}</p>}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void searchMusic(); }}
                placeholder="Search music — e.g. upbeat, lo-fi, cinematic"
                aria-label="Search music"
                className="flex-1 rounded-lg border border-card-border px-3 py-2 text-xs"
              />
              <Button size="sm" onClick={() => void searchMusic()} disabled={searching || !query.trim()}>
                {searching ? "…" : "Search"}
              </Button>
            </div>
            {results.length > 0 && (
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {results.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-xs border border-card-border rounded-lg px-2 py-1.5 bg-panel">
                    <button
                      type="button"
                      onClick={() => togglePlay(r)}
                      aria-label={`${playingId === r.id ? "Stop" : "Play"} ${trackName(r)}`}
                      className="w-6 h-6 shrink-0 rounded-full bg-surface-3 text-ink flex items-center justify-center hover:bg-tint-blue"
                    >
                      {playingId === r.id ? "■" : "▶"}
                    </button>
                    <span className="flex-1 truncate">{trackName(r)}</span>
                    {r.durationSec ? <span className="text-[10px] text-ink-soft shrink-0">{Math.floor(r.durationSec / 60)}:{String(Math.round(r.durationSec % 60)).padStart(2, "0")}</span> : null}
                    <button
                      type="button"
                      className="text-brand font-semibold shrink-0"
                      onClick={() => {
                        audioRef.current?.pause();
                        setPlayingId(null);
                        change({
                          music: { url: r.downloadUrl, title: trackName(r), attribution: r.attribution, volume: 0.18, startSec: 0, duck: true },
                        }, COMMIT_DELAY.click);
                      }}
                    >
                      Use
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-xs font-bold text-ink uppercase tracking-wider mb-2">Fades</h4>
        <div className="grid grid-cols-2 gap-3">
          {([["In", "fadeIn"], ["Out", "fadeOut"]] as const).map(([label, key]) => (
            <div key={label} className="space-y-1">
              <div className="flex justify-between text-[10px] text-ink-soft">
                <span>Fade {label.toLowerCase()}</span><span>{s[key].toFixed(1)}s</span>
              </div>
              <input
                type="range" min={0} max={1.5} step={0.1} value={s[key]}
                aria-label={`Fade ${label.toLowerCase()}`}
                onChange={(e) => change({ [key]: Number(e.target.value) } as Partial<State>, COMMIT_DELAY.drag)}
                className="w-full h-1 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-brand"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Ground-truth preview: the same filter graph the render uses. */}
      <div className="rounded-xl border border-dashed border-card-border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-ink uppercase tracking-wider">Preview</h4>
          <button type="button" onClick={() => void loadPreview()} disabled={previewing} className="text-xs font-bold text-brand hover:underline disabled:opacity-50">
            {previewing ? "Rendering…" : frames ? "Refresh" : "Show me"}
          </button>
        </div>
        {frames && frames.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {frames.map((f) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f.atSec} src={f.dataUrl} alt={`Frame at ${f.atSec.toFixed(1)}s`} className="w-full rounded-lg border border-card-border" />
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-ink-soft">
            Real frames from the actual render — framing, captions, colour and watermark exactly as they will appear.
          </p>
        )}
      </div>

      {shown && <p role="alert" className="text-xs text-error">{shown}</p>}
      {statusText && <p role="status" aria-live="polite" className="text-[11px] text-ink-soft text-center">{statusText}</p>}
    </div>
  );
}
