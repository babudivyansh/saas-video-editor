"use client";

// Caption Studio, step 2: pick the template and edit the captions word by
// word, on one screen. Templates in a rail on the left (a pick applies at
// once, word edits stay), the video in the middle, the transcript and the
// selected word's own look and timing on the right, and the line's words on
// a timeline underneath. Every change saves through useStudioProject.
//
// The captions are transcribed in the background the first time this opens;
// until they arrive the preview plays the picked template's sample line.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import CaptionTemplateGallery from "@/app/components/captions/CaptionTemplateGallery";
import { useCaptionTemplates } from "@/app/components/captions/useCaptionTemplates";
import { useUpgradePrompt } from "@/app/components/captions/useUpgradePrompt";
import { EMOJI_SET } from "@clipiro/shared/caption-emoji";
import { WORD_EMPHASES, type CaptionWordStyle, type WordEmphasis } from "@clipiro/shared/caption-style";
import { clientAuthToken } from "@/lib/client-session";
import { currentTemplateId, withTemplate } from "@/lib/captions/studio";
import type { SavedCaptionTemplate } from "@/lib/captions/user-templates";
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
import type { StudioProject, TranscribeState } from "./useStudioProject";

const SWATCHES = ["#FFFFFF", "#C8FF55", "#20D68A", "#F5B544", "#FF6B6B", "#FF4FA3", "#4EA8FF"];
const EMPHASIS_LABEL: Record<WordEmphasis, string> = { bigger: "Bigger", shake: "Shake", box: "Box" };

const clock = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${(sec % 60).toFixed(1).padStart(4, "0")}`;

type Selection = { cueId: string; index: number } | null;

export interface TemplateEditStepProps {
  project: StudioProject;
  transcribe: TranscribeState;
  save: (change: (doc: TimelineDoc) => TimelineDoc, extra?: { subtitlesStyle?: Record<string, unknown> }) => Promise<unknown>;
  startTranscription: (templateIdFor: () => string) => Promise<void>;
}

export function TemplateEditStep({ project, transcribe, save, startTranscription }: TemplateEditStepProps) {
  const { doc } = project;
  const { templates } = useCaptionTemplates();
  const upgrade = useUpgradePrompt();

  // ── Template ──────────────────────────────────────────────────────────
  const [picked, setPicked] = useState<string>(currentTemplateId(doc) ?? project.startTemplateId);
  const [savedPick, setSavedPick] = useState<SavedCaptionTemplate | null>(null);
  const [saved, setSaved] = useState<SavedCaptionTemplate[]>([]);
  // Read by transcription when it finishes, which may be after later picks.
  const pickedRef = useRef(picked);
  useEffect(() => { pickedRef.current = picked; }, [picked]);

  // Captions are made once, the first time the project opens.
  useEffect(() => {
    if (doc.tracks.caption.length === 0 && transcribe.status === "idle") void startTranscription(() => pickedRef.current);
  }, [doc.tracks.caption.length, transcribe.status, startTranscription]);

  useEffect(() => {
    const token = clientAuthToken();
    fetch("/api/caption-templates/mine", { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.templates) setSaved(d.templates); })
      .catch(() => {});
  }, []);

  /** Applies a library template (keeping the project's style) or a saved look (its template and its style). */
  const choose = (templateId: string, look: SavedCaptionTemplate | null) => {
    setPicked(templateId);
    setSavedPick(look);
    const style = look ? look.style : doc.captionStyle;
    void save(
      (d) => {
        const next = withTemplate(d, templateId);
        if (style && Object.keys(style).length) return { ...next, captionStyle: style };
        const { captionStyle: _drop, ...rest } = next;
        return rest as TimelineDoc;
      },
      // Read by transcription if it is still running: the captions land on this pick.
      { subtitlesStyle: { templateId, ...(project.language ? { language: project.language } : {}), removeFillers: project.removeFillers } },
    );
  };
  const pickedName = savedPick?.name ?? templates.find((t) => t.id === picked)?.name ?? null;

  // ── Words ─────────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [picks, setSel] = useState<Selection>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const cues = doc.tracks.caption;
  const captionsReady = cues.length > 0;
  // The first line is selected until the user picks one (also when
  // transcription delivers the captions while this is open).
  const sel: Selection = picks ?? (cues[0] ? { cueId: cues[0].id, index: 0 } : null);
  // Until then the preview loops muted on its own; once there are words to
  // edit it stops and waits for the play button (with sound).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const sync = () => setPlaying(!v.paused);
    v.addEventListener("play", sync);
    v.addEventListener("pause", sync);
    if (captionsReady) v.pause();
    return () => {
      v.removeEventListener("play", sync);
      v.removeEventListener("pause", sync);
    };
  }, [captionsReady]);
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
    if (v.paused) void v.play(); else v.pause();
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
    // On a desktop the screen fits the window (the page is h-screen on this
    // step) and each column scrolls on its own.
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_400px] lg:grid-rows-[minmax(0,1fr)_auto]">
      {/* Templates */}
      <section aria-labelledby="cs-templates" className="flex min-h-0 flex-col gap-3.5 border-line bg-surface-1 p-4 lg:overflow-y-auto lg:border-r">
        <div className="flex flex-col gap-1">
          <h2 id="cs-templates" className="text-lg font-extrabold">Template</h2>
          <p className="text-xs text-fg-subtle">
            {pickedName ? <><span className="font-semibold text-fg">{pickedName}</span> applied. Your word edits stay when you switch.</> : "A pick applies at once. Your word edits stay."}
          </p>
        </div>

        {saved.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.08em] text-fg-subtle">My templates</h3>
            <div className="flex flex-wrap gap-1.5">
              {saved.map((s) => {
                const on = savedPick?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => choose(s.baseTemplateId, s)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
                      on ? "bg-primary text-on-primary" : "border border-emerald-bright/40 text-emerald-bright hover:bg-emerald-brand/10"
                    }`}
                  >
                    {s.name}{s.isDefault ? " · default" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <CaptionTemplateGallery
          value={savedPick ? null : picked}
          onChange={(id) => { if (id !== picked || savedPick) choose(id, null); }}
          onLocked={upgrade}
          columns={2}
          maxHeightClass="max-h-[60vh] lg:max-h-none"
        />
      </section>

      {/* Preview */}
      <section aria-label="Preview" className="flex min-h-[460px] flex-col items-center justify-center gap-4 p-5 lg:min-h-0">
        <StudioPreview
          doc={doc}
          media={project.media}
          templateId={captionsReady ? null : picked}
          maxWidth={420}
          maxHeight={540}
          videoRef={videoRef}
          autoPlay={!captionsReady}
          onTime={setTimeMs}
        />
        {captionsReady && (
          <div className="flex items-center gap-3 rounded-full border border-line bg-surface-2 px-3 py-1.5">
            <button type="button" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} className="flex h-8 w-8 items-center justify-center rounded-full bg-fg text-bg outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
              {playing
                ? <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
                : <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>}
            </button>
            <span className="font-mono text-xs text-fg-muted">{clock(timeMs / 1000)} / {clock(doc.tracks.video[0]?.duration ?? 0)}</span>
          </div>
        )}
      </section>

      {/* Transcript + selected word */}
      <aside aria-label="Captions" className="flex min-h-0 flex-col border-line bg-surface-1 lg:border-l">
        {!captionsReady ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <h1 className="text-lg font-extrabold">Captions</h1>
            <p className="max-w-[280px] text-sm text-fg-muted" role="status" aria-live="polite">
              {transcribe.status === "error"
                ? <span className="text-error">{transcribe.message}</span>
                : "Transcribing your video. Pick a template while you wait. Your captions appear here to edit."}
            </p>
            {transcribe.status === "error" && (
              transcribe.code === "insufficient_minutes"
                ? <Link href="/dashboard/upgrade" className="rounded-xl border border-line-strong px-4 py-2 text-sm font-semibold hover:bg-surface-3">Get more minutes</Link>
                : <button type="button" onClick={() => void startTranscription(() => pickedRef.current)} className="rounded-xl border border-line-strong px-4 py-2 text-sm font-semibold hover:bg-surface-3">Try again</button>
            )}
          </div>
        ) : (
          <>
            <section aria-labelledby="cs-lines" className="flex min-h-[200px] flex-1 flex-col lg:min-h-0">
              <div className="flex flex-col gap-2.5 border-b border-line p-4">
                <div className="flex items-center justify-between">
                  <h1 id="cs-lines" className="text-base font-extrabold">Captions</h1>
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
                    className="h-9 flex-shrink-0 rounded-[10px] border border-line-strong px-3 text-[13px] font-semibold hover:bg-surface-3 disabled:opacity-40"
                  >
                    {find.trim() ? `Fix all · ${matches}` : "Fix all"}
                  </button>
                </div>
                {note && <p role="status" className="text-xs text-success">{note}</p>}
              </div>
              <ol className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2.5">
                {cues.map((c, ci) => {
                  const open = c.id === sel?.cueId;
                  const live = spoken?.cueId === c.id;
                  return (
                    <li key={c.id}>
                      {open ? (
                        <div className="grid grid-cols-[44px_1fr] gap-2 rounded-xl border border-emerald-bright/35 bg-surface-3 px-2 py-2.5">
                          <span className="pt-1.5 font-mono text-[11px] text-emerald-bright">{clock(c.timelineStart)}</span>
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap gap-1.5">
                              {(c.words ?? []).map((w, wi) => {
                                const on = wi === sel?.index;
                                return (
                                  <button
                                    key={wi}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => select(c.id, wi)}
                                    className={`rounded-lg px-2 py-1 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
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
                              <button type="button" disabled={!sel || sel.index === 0} onClick={() => sel && edit((d) => splitCue(d, sel.cueId, sel.index))} className="rounded-lg border border-line-strong px-2 py-1 hover:bg-surface-2 disabled:opacity-40">Split before word</button>
                              <button type="button" disabled={ci === cues.length - 1} onClick={() => edit((d) => mergeWithNext(d, c.id))} className="rounded-lg border border-line-strong px-2 py-1 hover:bg-surface-2 disabled:opacity-40">Merge with next</button>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = cues[ci + 1] ?? cues[ci - 1];
                                  edit((d) => deleteCue(d, c.id));
                                  setSel(next ? { cueId: next.id, index: 0 } : null);
                                }}
                                className="rounded-lg border border-line-strong px-2 py-1 text-error hover:bg-error/10"
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
                          className={`grid w-full grid-cols-[44px_1fr] gap-2 rounded-xl px-2 py-2 text-left text-sm leading-normal outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-primary/70 ${live ? "text-fg" : "text-fg-muted"}`}
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

            <section aria-labelledby="cs-word" className="flex flex-shrink-0 flex-col gap-3 border-t border-line bg-surface-2 p-4">
              <div className="flex items-center justify-between">
                <h2 id="cs-word" className="text-[15px] font-extrabold">Word</h2>
                {word && <span className="text-xs text-fg-subtle">Line {cueIndex + 1} · word {(sel?.index ?? 0) + 1}</span>}
              </div>
              {!word || !sel ? (
                <p className="text-sm text-fg-muted">Pick a word in the transcript to change it.</p>
              ) : (
                <>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-fg-muted">
                    Text
                    <input
                      value={draft ?? word.word}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={(e) => commitText(e.currentTarget.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      className="h-10 rounded-[10px] border border-emerald-bright bg-surface-3 px-3 text-[15px] font-bold text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                    />
                  </label>

                  <fieldset className="flex flex-col">
                    <legend className="mb-1.5 text-xs font-semibold text-fg-muted">Color</legend>
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => setStyle({ color: undefined })} aria-pressed={!word.style?.color} aria-label="Template colour" className={`flex h-7 w-7 items-center justify-center rounded-full border border-line-strong text-[10px] text-fg-muted ${!word.style?.color ? "outline outline-2 outline-offset-2 outline-primary" : ""}`}>Aa</button>
                      {SWATCHES.map((c) => (
                        <button key={c} type="button" onClick={() => setStyle({ color: c })} aria-pressed={word.style?.color === c} aria-label={`Colour ${c}`} className={`h-7 w-7 rounded-full ${word.style?.color === c ? "outline outline-2 outline-offset-2 outline-primary" : ""}`} style={{ background: c }} />
                      ))}
                      <label className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-dashed border-line-strong text-fg-muted" title="Any colour">
                        <span aria-hidden="true">+</span>
                        <input type="color" aria-label="Any colour" value={word.style?.color ?? "#ffffff"} onChange={(e) => setStyle({ color: e.target.value.toUpperCase() })} className="absolute inset-0 cursor-pointer opacity-0" />
                      </label>
                    </div>
                  </fieldset>

                  <fieldset className="flex flex-col">
                    <legend className="mb-1.5 text-xs font-semibold text-fg-muted">Emphasis</legend>
                    <div className="grid grid-cols-4 gap-1.5 text-xs font-semibold">
                      {WORD_EMPHASES.map((e) => {
                        const on = word.style?.emphasis === e;
                        return (
                          <button key={e} type="button" aria-pressed={on} onClick={() => setStyle({ emphasis: on ? undefined : e })} className={`h-8 rounded-[9px] ${on ? "border border-primary/50 bg-primary/10 text-primary" : "border border-line-strong hover:bg-surface-3"}`}>
                            {EMPHASIS_LABEL[e]}
                          </button>
                        );
                      })}
                      <button type="button" aria-expanded={emojiOpen} onClick={() => setEmojiOpen((o) => !o)} className={`h-8 rounded-[9px] ${word.style?.emoji ? "border border-primary/50 bg-primary/10 text-primary" : "border border-line-strong hover:bg-surface-3"}`}>
                        {word.style?.emoji ? `${word.style.emoji} Emoji` : "+ Emoji"}
                      </button>
                    </div>
                    {emojiOpen && (
                      <div className="mt-2 grid grid-cols-8 gap-1 rounded-xl border border-line bg-surface-1 p-2" role="listbox" aria-label="Emoji">
                        {word.style?.emoji && (
                          <button type="button" onClick={() => { setStyle({ emoji: undefined }); setEmojiOpen(false); }} className="col-span-8 rounded-lg py-1 text-xs text-fg-muted hover:bg-surface-3">Remove emoji</button>
                        )}
                        {EMOJI_SET.map((em) => (
                          <button key={em} type="button" role="option" aria-selected={word.style?.emoji === em} onClick={() => { setStyle({ emoji: em }); setEmojiOpen(false); }} className="rounded-lg py-1 text-lg hover:bg-surface-3">{em}</button>
                        ))}
                      </div>
                    )}
                  </fieldset>

                  <fieldset className="grid grid-cols-2 gap-2">
                    <legend className="mb-1.5 text-xs font-semibold text-fg-muted">Timing</legend>
                    {(["startMs", "endMs"] as const).map((edge) => (
                      <div key={edge} className="flex items-center gap-1 text-[11px] text-fg-subtle">
                        <span className="w-7">{edge === "startMs" ? "Start" : "End"}</span>
                        <button type="button" aria-label={`${edge === "startMs" ? "Start" : "End"} earlier`} onClick={() => nudge(edge, -50)} className="h-7 w-7 rounded-lg border border-line-strong text-fg hover:bg-surface-3">−</button>
                        <span className="flex-1 text-center font-mono text-xs text-fg">{clock((cue!.timelineStart * 1000 + word[edge]) / 1000)}</span>
                        <button type="button" aria-label={`${edge === "startMs" ? "Start" : "End"} later`} onClick={() => nudge(edge, 50)} className="h-7 w-7 rounded-lg border border-line-strong text-fg hover:bg-surface-3">+</button>
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
                      className="rounded-xl border border-line-strong py-2 text-[13px] font-semibold hover:bg-surface-3"
                    >
                      Apply this look to all {sameWord} “{word.word}”
                    </button>
                  )}
                </>
              )}
            </section>
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
