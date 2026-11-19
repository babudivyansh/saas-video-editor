"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { Switch } from "@/app/components/ui/Switch";
import { ClipScrubber } from "./ClipScrubber";
import { PanelSection, PanelSlider, Segmented, useAccordion } from "./PanelSection";
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
/** One tap fills the search box and searches. */
const MOODS = ["Upbeat", "Lo-fi", "Cinematic", "Chill"] as const;

/** 34.9 -> "0:34.9" */
function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${m}:${(sec - m * 60).toFixed(1).padStart(4, "0")}`;
}

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
  projectId, clipId, windowSec, peaks, initial, error: commitError, onCommit,
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

  async function searchMusic(q: string = query) {
    if (!q.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/editor/stock/search?type=audio&q=${encodeURIComponent(q)}`, { headers: authHeaders() });
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
  const section = useAccordion("trim");
  const trimmed = trimOf(s);
  const edited = !!trimmed || s.speed !== 1 || !!s.music || s.fadeIn > 0 || s.fadeOut > 0;
  const fadesSummary = s.fadeIn > 0 || s.fadeOut > 0 ? `In ${s.fadeIn.toFixed(1)}s · Out ${s.fadeOut.toFixed(1)}s` : "Off";

  return (
    <div className="space-y-2">
      <PanelSection
        title="Trim"
        summary={trimmed ? `${fmtClock(s.trimStart)} – ${fmtClock(s.trimEnd)}` : "Whole clip"}
        {...section("trim")}
      >
        <ClipScrubber
          peaks={peaks}
          durationSec={windowSec}
          startSec={s.trimStart}
          endSec={s.trimEnd}
          onChange={({ startSec, endSec }) => change({ trimStart: startSec, trimEnd: endSec }, COMMIT_DELAY.drag)}
        />
      </PanelSection>

      <PanelSection title="Speed" summary={`${s.speed}×`} {...section("speed")}>
        <Segmented
          label="Speed"
          options={SPEEDS.map((v) => ({ value: v as number, label: `${v}×` }))}
          value={s.speed}
          onChange={(v) => change({ speed: v }, COMMIT_DELAY.click)}
        />
        {s.speed !== 1 && (
          <p className="text-[11px] text-fg-muted">
            Clip becomes {((s.trimEnd - s.trimStart) / s.speed).toFixed(1)}s. Captions and framing follow automatically.
          </p>
        )}
      </PanelSection>

      <PanelSection title="Music bed" summary={s.music ? (s.music.title ?? "Selected track") : "None"} {...section("music")}>
        {s.music ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-semibold text-fg">{s.music.title ?? "Selected track"}</p>
              <button type="button" onClick={() => change({ music: undefined }, COMMIT_DELAY.click)} className="text-[11px] font-semibold text-fg-muted hover:text-fg">Remove</button>
            </div>
            <PanelSlider
              label="Volume"
              value={s.music.volume}
              display={`${Math.round(s.music.volume * 100)}%`}
              min={0} max={0.6} step={0.02}
              onChange={(v) => change({ music: { ...s.music!, volume: v } }, COMMIT_DELAY.drag)}
            />
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold text-fg">Duck under speech</p>
                <p className="text-[11px] text-fg-muted">Music drops while someone is talking.</p>
              </div>
              <Switch checked={s.music.duck} onChange={(v) => change({ music: { ...s.music!, duck: v } }, COMMIT_DELAY.click)} label="Duck under speech" />
            </div>
            {/* Jamendo's licence requires the artist to be credited. */}
            {s.music.attribution && <p className="text-[10px] leading-tight text-fg-subtle">{s.music.attribution}</p>}
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
                className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-xs text-fg"
              />
              <Button size="sm" variant="secondary" onClick={() => void searchMusic()} disabled={searching || !query.trim()}>
                {searching ? "…" : "Search"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MOODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setQuery(m); void searchMusic(m); }}
                  className="min-h-[30px] rounded-full border border-line px-3 text-[12px] font-semibold text-fg-muted hover:border-line-strong hover:text-fg"
                >
                  {m}
                </button>
              ))}
            </div>
            {results.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {results.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-bg px-2 py-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => togglePlay(r)}
                      aria-label={`${playingId === r.id ? "Stop" : "Play"} ${trackName(r)}`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-strong text-fg hover:bg-surface-3"
                    >
                      {playingId === r.id ? "■" : "▶"}
                    </button>
                    <span className="flex-1 truncate">{trackName(r)}</span>
                    {r.durationSec ? <span className="shrink-0 font-mono text-[10px] text-fg-subtle">{Math.floor(r.durationSec / 60)}:{String(Math.round(r.durationSec % 60)).padStart(2, "0")}</span> : null}
                    <button
                      type="button"
                      className="shrink-0 font-semibold text-emerald-bright"
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
      </PanelSection>

      <PanelSection title="Fades" summary={fadesSummary} {...section("fades")}>
        <div className="grid grid-cols-2 gap-4">
          {([["In", "fadeIn"], ["Out", "fadeOut"]] as const).map(([label, key]) => (
            <PanelSlider
              key={label}
              label={`Fade ${label.toLowerCase()}`}
              value={s[key]}
              display={`${s[key].toFixed(1)}s`}
              min={0} max={1.5} step={0.1}
              onChange={(v) => change({ [key]: v } as Partial<State>, COMMIT_DELAY.drag)}
            />
          ))}
        </div>
      </PanelSection>

      {/* Ground-truth preview: the same filter graph the render uses. */}
      <PanelSection title="Preview frames" summary={frames ? `${frames.length} frames` : "Not loaded"} {...section("preview")}>
        <p className="text-[11px] text-fg-muted">
          Real frames from the actual render — framing, captions, colour and watermark exactly as they will appear.
        </p>
        {frames && frames.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {frames.map((f) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f.atSec} src={f.dataUrl} alt={`Frame at ${f.atSec.toFixed(1)}s`} className="w-full rounded-lg border border-line" />
            ))}
          </div>
        )}
        <Button size="sm" variant="secondary" onClick={() => void loadPreview()} disabled={previewing}>
          {previewing ? "Rendering…" : frames ? "Refresh" : "Show me"}
        </Button>
      </PanelSection>

      {edited && (
        <button
          type="button"
          onClick={() => change({ speed: 1, fadeIn: 0, fadeOut: 0, music: undefined, trimStart: 0, trimEnd: windowSec }, COMMIT_DELAY.click)}
          className="px-0.5 py-1.5 text-[12px] font-semibold text-fg-muted underline hover:text-fg"
        >
          Reset all edits
        </button>
      )}

      {shown && <p role="alert" className="text-xs text-error">{shown}</p>}
    </div>
  );
}
