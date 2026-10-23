"use client";

// "Remove silences": scans every video clip's sound for pauses (server-side
// ffmpeg, free), shows what it found, and cuts them out of the whole timeline
// on confirm — one Ctrl+Z puts them back.

import React, { useState } from "react";
import { Modal } from "@/app/components/ui/Modal";
import { Button } from "@/app/components/ui/Button";
import { useEditorStore } from "../store/editorStore";
import { silencesToCuts } from "@/lib/editor/silences";
import { normalizeRanges, type TimeRange } from "@/lib/editor/ripple-cut";
import { clientAuthToken } from "@/lib/client-session";

const LENGTHS = [
  { sec: 0.5, label: "0.5 s" },
  { sec: 0.8, label: "0.8 s" },
  { sec: 1.2, label: "1.2 s" },
];

function stamp(sec: number) {
  const s = Math.max(0, sec);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}

export default function SilenceDialog() {
  const open = useEditorStore((s) => s.silenceOpen);
  const setOpen = useEditorStore((s) => s.setSilenceOpen);
  if (!open) return null;
  return <Body onClose={() => setOpen(false)} />;
}

function Body({ onClose }: { onClose: () => void }) {
  const doc = useEditorStore((s) => s.doc);
  const rippleCutRanges = useEditorStore((s) => s.rippleCutRanges);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const [minSec, setMinSec] = useState(0.8);
  const [scanning, setScanning] = useState(false);
  const [cuts, setCuts] = useState<TimeRange[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clips = doc.tracks.video.filter((c) => !c.hidden && !c.muted && c.volume > 0);

  async function scan() {
    setScanning(true);
    setError(null);
    setCuts(null);
    try {
      const token = clientAuthToken();
      const found: TimeRange[] = [];
      for (const clip of clips) {
        const res = await fetch("/api/editor/silences", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ assetId: clip.assetId, srcIn: clip.srcIn, duration: clip.duration * (clip.speed ?? 1), minSilenceSec: minSec }),
        });
        const data = (await res.json().catch(() => ({}))) as { silences?: TimeRange[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Couldn't scan for silence");
        found.push(...silencesToCuts(clip, data.silences ?? []));
      }
      setCuts(normalizeRanges(found));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't scan for silence");
    } finally {
      setScanning(false);
    }
  }

  const total = (cuts ?? []).reduce((n, c) => n + (c.end - c.start), 0);

  return (
    <Modal open onClose={scanning ? () => {} : onClose} title="Remove silences" maxWidth="max-w-lg">
      <div className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-fg-muted">
          Finds the quiet gaps in your video clips and cuts them out, moving everything after each gap up so captions and overlays stay in sync. A little room is left around every word.
        </p>
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Cut pauses longer than</p>
          <div role="radiogroup" aria-label="Pause length" className="flex gap-2">
            {LENGTHS.map((l) => (
              <button key={l.sec} type="button" role="radio" aria-checked={minSec === l.sec} onClick={() => { setMinSec(l.sec); setCuts(null); }}
                      className={`flex-1 rounded-xl border px-3 py-2 text-[13px] font-semibold transition-colors ${minSec === l.sec ? "border-primary/60 bg-primary/10 text-fg" : "border-line text-fg-muted hover:text-fg"}`}>
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {clips.length === 0 && <p className="rounded-xl border border-line bg-surface-1 px-3.5 py-3 text-[13px] text-fg-muted">There are no video clips with sound on the timeline.</p>}
        {error && <p role="alert" className="text-sm text-error">{error}</p>}

        {cuts && (
          cuts.length === 0 ? (
            <p className="rounded-xl border border-line bg-surface-1 px-3.5 py-3 text-[13px] text-fg-muted">No pauses longer than {minSec} s — nothing to cut.</p>
          ) : (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-1 p-3">
              <p className="text-[13.5px] text-fg"><b>{cuts.length} pause{cuts.length === 1 ? "" : "s"}</b> · {total.toFixed(1)} s shorter</p>
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto text-[12.5px] text-fg-muted">
                {cuts.map((c, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span className="font-mono">{stamp(c.start)} – {stamp(c.end)}</span>
                    <button type="button" onClick={() => { setCurrentTime(Math.max(0, c.start - 1)); onClose(); }} className="text-[12px] font-semibold text-primary hover:underline">Listen</button>
                  </li>
                ))}
              </ul>
            </div>
          )
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={scanning}>Cancel</Button>
          {cuts && cuts.length > 0 ? (
            <Button type="button" onClick={() => { rippleCutRanges(cuts); onClose(); }}>Cut {cuts.length} pause{cuts.length === 1 ? "" : "s"}</Button>
          ) : (
            <Button type="button" onClick={() => void scan()} loading={scanning} disabled={clips.length === 0}>{scanning ? "Listening…" : "Find pauses"}</Button>
          )}
        </div>
        <p className="text-[11.5px] text-fg-subtle">Free. Ctrl+Z undoes the cut.</p>
      </div>
    </Modal>
  );
}
