"use client";

// Caption Studio, step 3: edit the captions word by word. The transcript on
// the left (click a line or a word), the video in the middle, the selected
// word's own look and timing on the right, and the line's words on a
// timeline underneath. Every change saves through useStudioProject.

import { useCallback, useMemo, useRef, useState } from "react";
import { EMOJI_SET } from "@clipiro/shared/caption-emoji";
import { WORD_EMPHASES, type CaptionWordStyle, type WordEmphasis } from "@clipiro/shared/caption-style";
import type { TimelineDoc } from "@/lib/editor/types";
import {
  countMatches,
  cueAt,
  deleteCue,
  mergeWithNext,
  replaceAll,
  splitCue,
  styleMatching,
  updateWord,
} from "@/lib/captions/studio-edit";
import { StudioPreview } from "./StudioPreview";
import type { StudioProject } from "./useStudioProject";

const SWATCHES = ["#FFFFFF", "#C8FF55", "#20D68A", "#F5B544", "#FF6B6B", "#FF4FA3", "#4EA8FF"];
const EMPHASIS_LABEL: Record<WordEmphasis, string> = { bigger: "Bigger", shake: "Shake", box: "Box" };

const clock = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${(sec % 60).toFixed(1).padStart(4, "0")}`;

type Selection = { cueId: string; index: number } | null;

export interface EditStepProps {
  project: StudioProject;
  save: (change: (doc: TimelineDoc) => TimelineDoc) => Promise<unknown>;
}

export function EditStep({ project, save }: EditStepProps) {
  const { doc } = project;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState<Selection>(() => (doc.tracks.caption[0] ? { cueId: doc.tracks.caption[0].id, index: 0 } : null));
  const [draft, setDraft] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const cues = doc.tracks.caption;
  const cue = cues.find((c) => c.id === sel?.cueId) ?? null;
  const word = cue && sel ? cue.words?.[sel.index] ?? null : null;
  const spoken = useMemo(() => cueAt(doc, timeMs), [doc, timeMs]);
  const matches = find.trim() ? countMatches(doc, find) : 0;
  const sameWord = word ? countMatches(doc, word.word) : 0;

  const seek = useCallback((sec: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, sec + 0.01);
  }, []);
  const select = (cueId: string, index: number) => {
    setSel({ cueId, index });
    setDraft(null);
    setEmojiOpen(false);
    const c = cues.find((x) => x.id === cueId);
    if (c) seek(c.timelineStart + (c.words?.[index]?.startMs ?? 0) / 1000);
  };
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { void v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  };

  const edit = (change: (d: TimelineDoc) => TimelineDoc) => { void save(change); };
  const setStyle = (patch: Partial<CaptionWordStyle>) => {
    if (sel) edit((d) => updateWord(d, sel.cueId, sel.index, { style: patch }));
  };
  // Reads the field itself, not `draft`: a blur can arrive before the last
  // keystroke's re-render.
  const commitText = (value: string) => {
    if (sel && word && value.trim() !== word.word) edit((d) => updateWord(d, sel.cueId, sel.index, { word: value }));
    setDraft(null);
  };
  const nudge = (edge: "startMs" | "endMs", deltaMs: number) => {
    if (sel && word) edit((d) => updateWord(d, sel.cueId, sel.index, { [edge]: word[edge] + deltaMs }));
  };

  const cueIndex = cue ? cues.indexOf(cue) : -1;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)_330px] lg:grid-rows-[minmax(0,1fr)_auto]">
      {/* Transcript */}
      <section aria-labelledby="cs-lines" className="flex min-h-0 flex-col border-line bg-surface-1 lg:border-r">
        <div className="flex flex-col gap-3 border-b border-line p-4">
          <div className="flex items-center justify-between">
            <h1 id="cs-lines" className="text-lg font-extrabold">Captions</h1>
            <span className="font-mono text-xs text-fg-subtle">{cues.length} lines · {cues.reduce((n, c) => n + (c.words?.length ?? 0), 0)} words</span>
          </div>
          <div className="flex gap-2">
            <label className="flex-1">
              <span className="sr-only">Find</span>
              <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find" className="h-9 w-full rounded-[10px] border border-line-strong bg-surface-3 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/70" />
            </label>
            <label className="flex-1">
              <span className="sr-only">Replace with</span>
              <input value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="Replace with" className="h-9 w-full rounded-[10px] border border-line-strong bg-surface-3 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/70" />
            </label>
          </div>
          <button
            type="button"
            disabled={!matches || !replace.trim()}
            onClick={() => {
              const n = matches;
              edit((d) => replaceAll(d, find, replace).doc);
              setNote(`Replaced ${n} ${n === 1 ? "word" : "words"}.`);
              setFind("");
              setReplace("");
            }}
            className="h-9 rounded-[10px] border border-line-strong text-[13px] font-semibold hover:bg-surface-3 disabled:opacity-40"
          >
            {find.trim() ? `Fix all · ${matches} found` : "Fix all"}
          </button>
          {note && <p role="status" className="text-xs text-success">{note}</p>}
        </div>
        <ol className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
          {cues.map((c, ci) => {
            const open = c.id === sel?.cueId;
            const live = spoken?.cueId === c.id;
            return (
              <li key={c.id}>
                {open ? (
                  <div className="grid grid-cols-[48px_1fr] gap-2.5 rounded-xl border border-emerald-bright/35 bg-surface-3 px-2.5 py-3">
                    <span className="pt-1.5 font-mono text-[11px] text-emerald-bright">{clock(c.timelineStart)}</span>
                    <div className="flex flex-col gap-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {(c.words ?? []).map((w, wi) => {
                          const on = wi === sel?.index;
                          return (
                            <button
                              key={wi}
                              type="button"
                              aria-pressed={on}
                              onClick={() => select(c.id, wi)}
                              className={`rounded-lg px-2 py-1 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
                                on ? "bg-primary text-on-primary" : "border border-line-strong bg-surface-2 hover:border-fg/30"
                              }`}
                              style={!on && w.style?.color ? { color: w.style.color } : undefined}
                            >
                              {w.word}{w.style?.emoji ? ` ${w.style.emoji}` : ""}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        <button type="button" disabled={!sel || sel.index === 0} onClick={() => sel && edit((d) => splitCue(d, sel.cueId, sel.index))} className="rounded-lg border border-line-strong px-2.5 py-1 hover:bg-surface-2 disabled:opacity-40">Split before word</button>
                        <button type="button" disabled={ci === cues.length - 1} onClick={() => edit((d) => mergeWithNext(d, c.id))} className="rounded-lg border border-line-strong px-2.5 py-1 hover:bg-surface-2 disabled:opacity-40">Merge with next</button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = cues[ci + 1] ?? cues[ci - 1];
                            edit((d) => deleteCue(d, c.id));
                            setSel(next ? { cueId: next.id, index: 0 } : null);
                          }}
                          className="rounded-lg border border-line-strong px-2.5 py-1 text-error hover:bg-error/10"
                        >
                          Delete line
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => select(c.id, 0)}
                    className={`grid w-full grid-cols-[48px_1fr] gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm leading-normal outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-primary/70 ${live ? "text-fg" : "text-fg-muted"}`}
                  >
                    <span className={`pt-0.5 font-mono text-[11px] ${live ? "text-emerald-bright" : "text-fg-subtle"}`}>{clock(c.timelineStart)}</span>
                    <span>{c.text}</span>
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {/* Preview */}
      <section aria-label="Preview" className="flex min-h-[460px] flex-col items-center justify-center gap-4 p-5">
        <StudioPreview doc={doc} media={project.media} maxWidth={420} maxHeight={560} videoRef={videoRef} autoPlay={false} onTime={setTimeMs} />
        <div className="flex items-center gap-3 rounded-full border border-line bg-surface-2 px-3 py-1.5">
          <button type="button" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} className="flex h-8 w-8 items-center justify-center rounded-full bg-fg text-bg outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
            {playing
              ? <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>}
          </button>
          <span className="font-mono text-xs text-fg-muted">{clock(timeMs / 1000)} / {clock(doc.tracks.video[0]?.duration ?? 0)}</span>
        </div>
      </section>

      {/* Selected word */}
      <aside aria-labelledby="cs-word" className="flex flex-col gap-5 border-line bg-surface-1 p-5 lg:border-l">
        <div className="flex items-center justify-between">
          <h2 id="cs-word" className="text-base font-extrabold">Word</h2>
          {word && <span className="text-xs text-fg-subtle">Line {cueIndex + 1} · word {(sel?.index ?? 0) + 1}</span>}
        </div>
        {!word || !sel ? (
          <p className="text-sm text-fg-muted">Pick a word in the transcript to change it.</p>
        ) : (
          <>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-fg-muted">
              Text
              <input
                value={draft ?? word.word}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={(e) => commitText(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className="h-11 rounded-xl border border-emerald-bright bg-surface-3 px-3 text-base font-bold text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              />
            </label>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[13px] font-semibold text-fg-muted">Color</legend>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setStyle({ color: undefined })} aria-pressed={!word.style?.color} aria-label="Template colour" className={`flex h-8 w-8 items-center justify-center rounded-full border border-line-strong text-[10px] text-fg-muted ${!word.style?.color ? "outline outline-2 outline-offset-2 outline-primary" : ""}`}>Aa</button>
                {SWATCHES.map((c) => (
                  <button key={c} type="button" onClick={() => setStyle({ color: c })} aria-pressed={word.style?.color === c} aria-label={`Colour ${c}`} className={`h-8 w-8 rounded-full ${word.style?.color === c ? "outline outline-2 outline-offset-2 outline-primary" : ""}`} style={{ background: c }} />
                ))}
                <label className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-dashed border-line-strong text-fg-muted" title="Any colour">
                  <span aria-hidden="true">+</span>
                  <input type="color" aria-label="Any colour" value={word.style?.color ?? "#ffffff"} onChange={(e) => setStyle({ color: e.target.value.toUpperCase() })} className="absolute inset-0 cursor-pointer opacity-0" />
                </label>
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[13px] font-semibold text-fg-muted">Emphasis</legend>
              <div className="grid grid-cols-2 gap-2 text-[13px] font-semibold">
                {WORD_EMPHASES.map((e) => {
                  const on = word.style?.emphasis === e;
                  return (
                    <button key={e} type="button" aria-pressed={on} onClick={() => setStyle({ emphasis: on ? undefined : e })} className={`h-[38px] rounded-[10px] ${on ? "border border-primary/50 bg-primary/10 text-primary" : "border border-line-strong hover:bg-surface-3"}`}>
                      {EMPHASIS_LABEL[e]}
                    </button>
                  );
                })}
                <button type="button" aria-expanded={emojiOpen} onClick={() => setEmojiOpen((o) => !o)} className={`h-[38px] rounded-[10px] ${word.style?.emoji ? "border border-primary/50 bg-primary/10 text-primary" : "border border-line-strong hover:bg-surface-3"}`}>
                  {word.style?.emoji ? `${word.style.emoji} Emoji` : "+ Emoji"}
                </button>
              </div>
              {emojiOpen && (
                <div className="grid grid-cols-8 gap-1 rounded-xl border border-line bg-surface-2 p-2" role="listbox" aria-label="Emoji">
                  {word.style?.emoji && (
                    <button type="button" onClick={() => { setStyle({ emoji: undefined }); setEmojiOpen(false); }} className="col-span-8 rounded-lg py-1 text-xs text-fg-muted hover:bg-surface-3">Remove emoji</button>
                  )}
                  {EMOJI_SET.map((em) => (
                    <button key={em} type="button" role="option" aria-selected={word.style?.emoji === em} onClick={() => { setStyle({ emoji: em }); setEmojiOpen(false); }} className="rounded-lg py-1 text-lg hover:bg-surface-3">{em}</button>
                  ))}
                </div>
              )}
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[13px] font-semibold text-fg-muted">Timing</legend>
              {(["startMs", "endMs"] as const).map((edge) => (
                <div key={edge} className="flex items-center gap-2 text-xs text-fg-subtle">
                  <span className="w-9">{edge === "startMs" ? "Start" : "End"}</span>
                  <button type="button" aria-label={`${edge === "startMs" ? "Start" : "End"} earlier`} onClick={() => nudge(edge, -50)} className="h-8 w-8 rounded-lg border border-line-strong text-fg hover:bg-surface-3">−</button>
                  <span className="flex-1 text-center font-mono text-[13px] text-fg">{clock((cue!.timelineStart * 1000 + word[edge]) / 1000)}</span>
                  <button type="button" aria-label={`${edge === "startMs" ? "Start" : "End"} later`} onClick={() => nudge(edge, 50)} className="h-8 w-8 rounded-lg border border-line-strong text-fg hover:bg-surface-3">+</button>
                </div>
              ))}
            </fieldset>

            {sameWord > 1 && word.style && (
              <button
                type="button"
                onClick={() => {
                  const style = word.style!;
                  edit((d) => styleMatching(d, word.word, { color: style.color, emphasis: style.emphasis, emoji: style.emoji }).doc);
                  setNote(`Styled all ${sameWord} times “${word.word}” appears.`);
                }}
                className="mt-auto rounded-xl border border-line-strong py-2.5 text-[13px] font-semibold hover:bg-surface-3"
              >
                Apply this look to all {sameWord} “{word.word}”
              </button>
            )}
          </>
        )}
      </aside>

      {/* The line's words in time */}
      {cue && (
        <section aria-label="Line timing" className="border-t border-line bg-surface-1 px-5 py-3 lg:col-span-3">
          <div className="relative h-10">
            {(cue.words ?? []).map((w, wi) => {
              const left = (w.startMs / (cue.duration * 1000)) * 100;
              const width = Math.max(2, ((w.endMs - w.startMs) / (cue.duration * 1000)) * 100);
              const on = wi === sel?.index;
              return (
                <button
                  key={wi}
                  type="button"
                  onClick={() => select(cue.id, wi)}
                  title={w.word}
                  className={`absolute top-0 h-10 overflow-hidden truncate rounded-lg px-2 text-left text-xs ${on ? "bg-primary font-extrabold text-on-primary" : "border border-line-strong bg-surface-3 text-fg-muted"}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                >
                  {w.word}
                </button>
              );
            })}
            {spoken?.cueId === cue.id && (
              <span aria-hidden="true" className="pointer-events-none absolute -top-1 bottom-[-4px] w-0.5 bg-fg" style={{ left: `${((timeMs - cue.timelineStart * 1000) / (cue.duration * 1000)) * 100}%` }} />
            )}
          </div>
        </section>
      )}
    </div>
  );
}
