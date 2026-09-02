"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { Switch } from "@/app/components/ui/Switch";
import { ClipScrubber } from "./ClipScrubber";

// The "Edit" tab of the Clip Studio drawer: trim, speed, music bed, fades —
// and, importantly, a preview of what the render will actually look like
// BEFORE it is paid for.

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export interface LiteEdits {
  v: 1;
  speed?: number;
  music?: { url: string; title?: string; attribution?: string; volume: number; startSec: number; duck: boolean };
  transition?: { fadeInSec?: number; fadeOutSec?: number };
}

interface StockAudioItem { id: string; title?: string; previewUrl?: string; downloadUrl: string; attribution?: string }
export interface PreviewFrame { atSec: number; dataUrl: string }

export interface LiteEditTabProps {
  projectId: string;
  clipId: string;
  durationSec: number;
  peaks: number[];
  initial: LiteEdits | null;
  busy: boolean;
  isFirstRerenderFree: boolean;
  onApply: (edits: LiteEdits, trim: { startSec: number; endSec: number } | null) => Promise<void>;
}

export function LiteEditTab({
  projectId, clipId, durationSec, peaks, initial, busy, isFirstRerenderFree, onApply,
}: LiteEditTabProps) {
  const [speed, setSpeed] = useState(initial?.speed ?? 1);
  const [fadeIn, setFadeIn] = useState(initial?.transition?.fadeInSec ?? 0);
  const [fadeOut, setFadeOut] = useState(initial?.transition?.fadeOutSec ?? 0);
  const [music, setMusic] = useState<LiteEdits["music"] | undefined>(initial?.music);

  // Trim is expressed against the clip's own timeline, so it always starts at
  // the full range and is converted back to absolute source time on Apply.
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(durationSec);
  const trimmed = trimStart > 0.05 || trimEnd < durationSec - 0.05;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockAudioItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [frames, setFrames] = useState<PreviewFrame[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setTrimEnd(durationSec); }, [durationSec]);

  const authHeaders = useCallback((): Record<string, string> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  async function searchMusic() {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/editor/stock/search?type=audio&q=${encodeURIComponent(query)}`, { headers: authHeaders() });
      const data = await res.json();
      setResults(Array.isArray(data.items) ? data.items.slice(0, 6) : []);
      if (!res.ok) setError(data.error ?? "Music search is unavailable right now.");
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
      // The whole point of this button is "see it before you pay for it", but
      // it used to POST an empty body — so the server rendered from the SAVED
      // clip and the user previewed the state they already had, not the edits
      // they were about to buy. Send the pending values.
      const pending: LiteEdits = {
        v: 1,
        ...(speed !== 1 ? { speed } : {}),
        ...(music ? { music } : {}),
        ...(fadeIn > 0 || fadeOut > 0
          ? { transition: { ...(fadeIn > 0 ? { fadeInSec: fadeIn } : {}), ...(fadeOut > 0 ? { fadeOutSec: fadeOut } : {}) } }
          : {}),
      };
      const res = await fetch(`/api/projects/${projectId}/clips/${clipId}/preview-frames`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          liteEdits: pending,
          ...(trimmed ? { startSec: trimStart, endSec: trimEnd } : {}),
        }),
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

  function apply() {
    const edits: LiteEdits = {
      v: 1,
      ...(speed !== 1 ? { speed } : {}),
      ...(music ? { music } : {}),
      ...(fadeIn > 0 || fadeOut > 0
        ? { transition: { ...(fadeIn > 0 ? { fadeInSec: fadeIn } : {}), ...(fadeOut > 0 ? { fadeOutSec: fadeOut } : {}) } }
        : {}),
    };
    return onApply(edits, trimmed ? { startSec: trimStart, endSec: trimEnd } : null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-xs font-bold text-ink uppercase tracking-wider mb-2">Trim</h4>
        <ClipScrubber
          peaks={peaks}
          durationSec={durationSec}
          startSec={trimStart}
          endSec={trimEnd}
          onChange={({ startSec, endSec }) => { setTrimStart(startSec); setTrimEnd(endSec); }}
          disabled={busy}
        />
      </div>

      <div>
        <h4 className="text-xs font-bold text-ink uppercase tracking-wider mb-2">Speed</h4>
        <div className="grid grid-cols-6 gap-1.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => setSpeed(s)}
              className={`rounded-lg border py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                speed === s ? "grad-brand text-white shadow-glow border-transparent" : "bg-white border-card-border text-ink-soft hover:bg-tint-blue"
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
        {speed !== 1 && (
          <p className="text-[10px] text-ink-soft mt-1.5">
            Clip becomes {(durationSec / speed).toFixed(1)}s. Captions and framing follow automatically.
          </p>
        )}
      </div>

      <div>
        <h4 className="text-xs font-bold text-ink uppercase tracking-wider mb-2">Music bed</h4>
        {music ? (
          <div className="rounded-lg border border-card-border p-3 space-y-2 bg-white">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-ink truncate">{music.title ?? "Selected track"}</p>
              <button type="button" onClick={() => setMusic(undefined)} className="text-[11px] text-ink-soft hover:text-ink">Remove</button>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-ink-soft">
                <span>Volume</span><span>{Math.round(music.volume * 100)}%</span>
              </div>
              <input
                type="range" min={0} max={0.6} step={0.02} value={music.volume} disabled={busy}
                onChange={(e) => setMusic({ ...music, volume: Number(e.target.value) })}
                className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-[11px] font-semibold text-ink block">Duck under speech</label>
                <span className="text-[10px] text-ink-soft">Music drops while someone is talking.</span>
              </div>
              <Switch checked={music.duck} onChange={(v) => setMusic({ ...music, duck: v })} label="Duck under speech" />
            </div>
            {/* Jamendo's licence requires the artist to be credited. */}
            {music.attribution && <p className="text-[9px] text-ink-soft/80 leading-tight">{music.attribution}</p>}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void searchMusic(); }}
                placeholder="Search music — e.g. upbeat, lo-fi, cinematic"
                className="flex-1 rounded-lg border border-card-border px-3 py-2 text-xs"
                disabled={busy}
              />
              <Button size="sm" onClick={() => void searchMusic()} disabled={busy || searching || !query.trim()}>
                {searching ? "…" : "Search"}
              </Button>
            </div>
            {results.length > 0 && (
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {results.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-xs border border-card-border rounded-lg px-2 py-1.5 bg-white">
                    <span className="truncate">{r.title ?? "Untitled"}</span>
                    <button
                      type="button"
                      className="text-brand font-semibold shrink-0"
                      onClick={() => setMusic({
                        url: r.downloadUrl, title: r.title, attribution: r.attribution,
                        volume: 0.18, startSec: 0, duck: true,
                      })}
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
          {([["In", fadeIn, setFadeIn], ["Out", fadeOut, setFadeOut]] as const).map(([label, value, set]) => (
            <div key={label} className="space-y-1">
              <div className="flex justify-between text-[10px] text-ink-soft">
                <span>Fade {label.toLowerCase()}</span><span>{value.toFixed(1)}s</span>
              </div>
              <input
                type="range" min={0} max={1.5} step={0.1} value={value} disabled={busy}
                onChange={(e) => set(Number(e.target.value))}
                className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Ground-truth preview: the same filter graph the render uses, so the
          user is not approving something they cannot see. */}
      <div className="rounded-xl border border-dashed border-card-border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-ink uppercase tracking-wider">Preview</h4>
          <button type="button" onClick={() => void loadPreview()} disabled={previewing || busy} className="text-xs font-bold text-brand hover:underline disabled:opacity-50">
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

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="space-y-1.5">
        <Button onClick={() => void apply()} disabled={busy} className="w-full">
          {busy ? "Saving & Rendering..." : "Apply Edits"}
        </Button>
        <p className="text-[11px] text-ink-soft text-center">
          {isFirstRerenderFree
            ? "Your first re-render of this clip is free."
            : "Applying re-renders this clip (1 credit). All changes above are applied together."}
        </p>
      </div>
    </div>
  );
}
