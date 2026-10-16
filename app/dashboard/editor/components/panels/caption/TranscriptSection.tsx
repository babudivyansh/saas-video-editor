"use client";

// The captions as a readable transcript: click any word to jump there, see
// the word being spoken, and find filler words — then drop them from the
// captions only, or cut them out of the video itself (every track moves up so
// nothing goes out of sync; one Ctrl+Z puts it all back).

import React, { useMemo } from "react";
import { Scissors } from "lucide-react";
import { useEditorStore } from "../../../store/editorStore";
import { findFillerWords } from "@/lib/editor/ripple-cut";
import { removeFillerWords } from "@/lib/editor/ai-text";

function stamp(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function TranscriptSection() {
  const doc = useEditorStore((s) => s.doc);
  const currentTime = useEditorStore((s) => s.currentTime);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const select = useEditorStore((s) => s.select);
  const applyCaptionTextEdit = useEditorStore((s) => s.applyCaptionTextEdit);
  const rippleCutRanges = useEditorStore((s) => s.rippleCutRanges);

  const captions = doc.tracks.caption;
  const fillers = useMemo(() => findFillerWords(doc), [doc]);
  const fillerStarts = useMemo(() => new Set(fillers.map((f) => `${f.captionId}:${Math.round(f.start * 1000)}`)), [fillers]);

  if (captions.length === 0) {
    return <p className="rounded-editor-md border border-dashed border-editor-border-strong p-3 text-[12px] text-editor-text-muted">Generate captions above and the transcript appears here — click any word to jump to it.</p>;
  }

  const fillerSeconds = fillers.reduce((n, f) => n + (f.end - f.start), 0);

  return (
    <div className="flex flex-col gap-2.5">
      {fillers.length > 0 && (
        <div className="flex flex-col gap-2 rounded-editor-md border border-warning/40 bg-warning/10 p-2.5">
          <p className="text-[12px] text-editor-text">
            <b className="text-warning">{fillers.length} filler word{fillers.length === 1 ? "" : "s"}</b> found ({fillerSeconds.toFixed(1)} s) —{" "}
            {Array.from(new Set(fillers.map((f) => `“${f.text.toLowerCase().replace(/[^\p{L} ]/gu, "")}”`))).slice(0, 3).join(", ")}
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => applyCaptionTextEdit(removeFillerWords)}
              className="flex-1 rounded-editor-sm border border-editor-border-strong bg-editor-card px-2 py-1.5 text-[11.5px] font-semibold text-editor-text hover:bg-editor-elevated"
            >
              Remove from captions
            </button>
            <button
              type="button"
              onClick={() => rippleCutRanges(fillers.map((f) => ({ start: f.start, end: f.end })))}
              className="flex flex-1 items-center justify-center gap-1 rounded-editor-sm bg-warning px-2 py-1.5 text-[11.5px] font-semibold text-editor-bg hover:opacity-90"
            >
              <Scissors className="h-3 w-3" /> Cut from video too
            </button>
          </div>
        </div>
      )}

      <div className="flex max-h-[340px] flex-col gap-3 overflow-y-auto pr-1 text-[13px] leading-relaxed">
        {captions.map((c) => {
          const active = currentTime >= c.timelineStart && currentTime < c.timelineStart + c.duration;
          return (
            <div key={c.id} className={c.hidden ? "opacity-40" : ""}>
              <button type="button" onClick={() => { setCurrentTime(c.timelineStart); select({ track: "caption", clipId: c.id }); }}
                      className="mb-0.5 font-mono text-[10.5px] text-editor-text-faint hover:text-editor-text">
                {stamp(c.timelineStart)}
              </button>
              <p className={active ? "text-editor-text" : "text-editor-text-muted"}>
                {c.words && c.words.length > 0
                  ? c.words.map((w, i) => {
                      const t = c.timelineStart + w.startMs / 1000;
                      const speaking = currentTime >= t && currentTime < c.timelineStart + w.endMs / 1000;
                      const filler = fillerStarts.has(`${c.id}:${Math.round(t * 1000)}`);
                      return (
                        <React.Fragment key={i}>
                          <button
                            type="button"
                            onClick={() => { setCurrentTime(t); select({ track: "caption", clipId: c.id }); }}
                            className={`rounded px-0.5 transition-colors hover:bg-editor-card ${
                              speaking ? "bg-[var(--primary)]/20 text-[var(--primary)]" : filler ? "text-warning line-through decoration-warning/70" : ""
                            }`}
                          >
                            {w.word}
                          </button>{" "}
                        </React.Fragment>
                      );
                    })
                  : c.text}
              </p>
            </div>
          );
        })}
      </div>
      <p className="px-0.5 text-[10.5px] leading-snug text-editor-text-faint">Click a word to jump there. To fix a word, select its caption and edit it on the right.</p>
    </div>
  );
}
