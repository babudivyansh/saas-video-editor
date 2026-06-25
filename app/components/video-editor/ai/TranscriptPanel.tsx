"use client";

import { useMemo, useState } from "react";
import { useEditorStore } from "../store/editorStore";
import { T } from "../editorTheme";
import {
  detectFillerRanges, detectSilenceRanges, isFiller,
  mainVideoClip, srcRangeToTimelineAll,
  type TimeRange,
} from "@/lib/transcript-edit";
import type { CaptionSegment } from "@/lib/track-editor-types";

function token() {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
}

export default function TranscriptPanel() {
  const present = useEditorStore(s => s.present);
  const applyTimeCuts = useEditorStore(s => s.applyTimeCuts);
  const setCurrentTime = useEditorStore(s => s.setCurrentTime);

  const [segments, setSegments] = useState<CaptionSegment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const clip = useMemo(() => mainVideoClip(present), [present]);

  async function transcribe() {
    if (!clip || clip.data.kind !== "video") return;
    const url = clip.data.url;
    // Cache by URL so we don't re-run Scribe on the same media.
    const cacheKey = `ve_transcript:${url}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) { setSegments(JSON.parse(cached)); return; }

    setLoading(true); setWarning("");
    try {
      const res = await fetch("/api/editor/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ videoUrl: url }),
      });
      const data = await res.json() as { segments?: CaptionSegment[]; warning?: string };
      const segs = data.segments ?? [];
      setSegments(segs);
      if (data.warning) setWarning(data.warning);
      if (segs.length) sessionStorage.setItem(cacheKey, JSON.stringify(segs));
    } catch {
      setWarning("Couldn't transcribe this clip. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function seekToWord(seg: CaptionSegment) {
    const mid = (seg.start + seg.end) / 2000; // source seconds
    const tl = srcRangeToTimelineAll(present, mid - 0.01, mid + 0.01)[0];
    if (tl) setCurrentTime(tl.start);
  }

  function toggleWord(i: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  function deleteSelected() {
    if (!segments || selected.size === 0) return;
    const ranges: TimeRange[] = [];
    for (const i of selected) {
      const s = segments[i];
      ranges.push(...srcRangeToTimelineAll(present, s.start / 1000, s.end / 1000));
    }
    applyTimeCuts(ranges);
    setSelected(new Set());
  }

  function removeFillers() {
    if (!segments) return;
    const srcRanges = detectFillerRanges(segments);
    const tl = srcRanges.flatMap(r => srcRangeToTimelineAll(present, r.start, r.end));
    applyTimeCuts(tl);
  }

  function removeSilences() {
    if (!segments) return;
    const srcRanges = detectSilenceRanges(segments);
    const tl = srcRanges.flatMap(r => srcRangeToTimelineAll(present, r.start, r.end));
    applyTimeCuts(tl);
  }

  const fillerCount = useMemo(() => segments ? segments.filter(s => isFiller(s.word)).length : 0, [segments]);
  const silenceCount = useMemo(() => segments ? detectSilenceRanges(segments).length : 0, [segments]);

  if (!clip) {
    return <div className="p-4 text-sm" style={{ color: T.textFaint }}>Add a video to the timeline, then transcribe it to edit by text.</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-2 flex-shrink-0" style={{ borderBottom: `1px solid ${T.border}` }}>
        {!segments ? (
          <button
            onClick={transcribe}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            style={{ background: T.accent, color: "#fff", opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "Transcribing…" : "✨ Transcribe & edit by text"}
          </button>
        ) : (
          <>
            <div className="flex gap-2">
              <button onClick={removeFillers} disabled={fillerCount === 0}
                className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors"
                style={{ background: T.surface3, color: fillerCount ? T.text : T.textFaint, border: `1px solid ${T.border}` }}>
                Remove fillers{fillerCount ? ` (${fillerCount})` : ""}
              </button>
              <button onClick={removeSilences} disabled={silenceCount === 0}
                className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors"
                style={{ background: T.surface3, color: silenceCount ? T.text : T.textFaint, border: `1px solid ${T.border}` }}>
                Remove silences{silenceCount ? ` (${silenceCount})` : ""}
              </button>
            </div>
            {selected.size > 0 && (
              <button onClick={deleteSelected}
                className="w-full py-2 rounded-lg text-xs font-bold transition-colors"
                style={{ background: "rgba(255,92,92,0.14)", color: T.red, border: `1px solid rgba(255,92,92,0.3)` }}>
                Delete {selected.size} selected word{selected.size > 1 ? "s" : ""} from video
              </button>
            )}
          </>
        )}
        {warning && <p className="text-[11px] leading-snug" style={{ color: T.amber }}>{warning}</p>}
      </div>

      {segments && (
        <div className="flex-1 overflow-y-auto p-3 text-sm leading-7" style={{ color: T.textMuted }}>
          {segments.length === 0 ? (
            <p style={{ color: T.textFaint }}>No speech detected in this clip.</p>
          ) : (
            <p className="select-none">
              {segments.map((seg, i) => {
                const sel = selected.has(i);
                const filler = isFiller(seg.word);
                return (
                  <span
                    key={i}
                    onClick={(e) => { if (e.shiftKey) toggleWord(i); else seekToWord(seg); }}
                    onDoubleClick={() => toggleWord(i)}
                    title="Click to seek · double-click (or shift-click) to select for deletion"
                    className="cursor-pointer rounded px-0.5 transition-colors"
                    style={{
                      background: sel ? "rgba(255,92,92,0.22)" : "transparent",
                      color: sel ? T.red : filler ? T.amber : T.text,
                      textDecoration: sel ? "line-through" : "none",
                    }}
                  >
                    {seg.word}{" "}
                  </span>
                );
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
