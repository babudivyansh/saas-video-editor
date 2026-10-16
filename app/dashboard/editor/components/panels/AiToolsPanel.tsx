"use client";

// "AI tools" rail tab: text operations on the selected text clip or caption,
// one-click clean-ups across every caption, and shortcuts to the AI features
// that live in other panels.

import React, { useState } from "react";
import { Captions, Command, Scissors, Sparkles } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import { AI_TEXT_ACTIONS, applyFreeOperation, useAiText } from "../../hooks/useAiText";
import type { AiTextOperation } from "@/lib/editor/ai-text";
import { realignWords } from "@/lib/editor/caption-words";

const LANGS = ["Spanish", "Hindi", "French", "German", "Portuguese", "Arabic", "Japanese"];

export default function AiToolsPanel() {
  const doc = useEditorStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const updateClip = useEditorStore((s) => s.updateClip);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const setPaletteOpen = useEditorStore((s) => s.setPaletteOpen);
  const setSilenceOpen = useEditorStore((s) => s.setSilenceOpen);
  const applyToCaptions = useEditorStore((s) => s.applyCaptionTextEdit);
  const { run, working, error } = useAiText();
  const [lang, setLang] = useState(LANGS[0]);
  const [notice, setNotice] = useState<string | null>(null);

  const target =
    selection?.track === "text" ? doc.tracks.text.find((c) => c.id === selection.clipId) :
    selection?.track === "caption" ? doc.tracks.caption.find((c) => c.id === selection.clipId) :
    undefined;

  async function onAction(op: AiTextOperation) {
    if (!target || !selection) return;
    setNotice(null);
    const out = await run(op, target.text, op === "translate" ? lang : undefined);
    if (out == null) return;
    // Text clips: an AI edit replaces the wording, so the rich-text doc goes
    // with it (see TextClipProps.tsx for why).
    if (selection.track === "text") updateClip("text", selection.clipId, { text: out, richText: undefined });
    else updateClip("caption", selection.clipId, { text: out, words: realignWords("words" in target ? target.words : undefined, out) });
  }

  function onAllCaptions(op: AiTextOperation, label: string) {
    const changed = applyToCaptions((text) => applyFreeOperation(op, text) ?? text);
    setNotice(changed > 0 ? `${label}: changed ${changed} caption${changed === 1 ? "" : "s"}.` : `${label}: nothing to change.`);
  }

  const captionCount = doc.tracks.caption.length;

  return (
    <div className="flex flex-col gap-4 p-3">
      <section className="flex flex-col gap-2">
        <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-editor-text-muted">Selected text or caption</p>
        {target ? (
          <div className="rounded-editor-md border border-editor-border bg-editor-card p-2.5 text-[12.5px] leading-snug text-editor-text">
            “{target.text.slice(0, 140)}{target.text.length > 140 ? "…" : ""}”
          </div>
        ) : (
          <p className="rounded-editor-md border border-dashed border-editor-border-strong p-2.5 text-[12px] text-editor-text-muted">
            Select a text clip or a caption on the timeline to rewrite, shorten, translate or tidy it.
          </p>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          {AI_TEXT_ACTIONS.filter((a) => a.op !== "translate").map((a) => (
            <button
              key={a.op}
              type="button"
              disabled={!target || !!working}
              onClick={() => void onAction(a.op)}
              className="rounded-editor-md border border-editor-border bg-editor-card px-2.5 py-2 text-left text-[12px] font-medium text-editor-text transition-colors hover:border-editor-border-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              {working === a.op ? "Working…" : a.label}
              {a.free && <span className="ml-1 text-[10.5px] text-editor-text-faint">· instant</span>}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Translate to"
                  className="flex-1 rounded-editor-md border border-editor-border bg-editor-card px-2 py-2 text-[12px] text-editor-text outline-none">
            {LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <button type="button" disabled={!target || !!working} onClick={() => void onAction("translate")}
                  className="rounded-editor-md border border-editor-border bg-editor-card px-3 py-2 text-[12px] font-medium text-editor-text hover:border-editor-border-strong disabled:cursor-not-allowed disabled:opacity-40">
            {working === "translate" ? "Working…" : "Translate"}
          </button>
        </div>
        {error && <p role="alert" className="text-[12px] text-red-400">{error}</p>}
        <p className="px-0.5 text-[10.5px] leading-snug text-editor-text-faint">AI rewrites are free: 5 a day on the free plan, 50 on paid plans. “Instant” ones don&apos;t count.</p>
      </section>

      <section className="flex flex-col gap-2">
        <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-editor-text-muted">All captions · {captionCount}</p>
        <button type="button" disabled={captionCount === 0} onClick={() => onAllCaptions("fillerWords", "Remove filler words")}
                className="rounded-editor-md border border-editor-border bg-editor-card px-3 py-2 text-left text-[12.5px] text-editor-text hover:border-editor-border-strong disabled:opacity-40">
          Remove filler words (“um”, “like”, “you know”)
        </button>
        <button type="button" disabled={captionCount === 0} onClick={() => onAllCaptions("emojis", "Add emojis")}
                className="rounded-editor-md border border-editor-border bg-editor-card px-3 py-2 text-left text-[12.5px] text-editor-text hover:border-editor-border-strong disabled:opacity-40">
          Add emojis to every caption
        </button>
        {notice && <p role="status" className="text-[12px] text-editor-accent">{notice}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-editor-text-muted">More</p>
        <button type="button" onClick={() => setSilenceOpen(true)} className="flex items-center gap-2.5 rounded-editor-md border border-editor-border bg-editor-card px-3 py-2.5 text-left text-[12.5px] text-editor-text hover:border-editor-border-strong">
          <Scissors className="h-4 w-4 text-editor-accent" /> Remove silences <span className="ml-auto text-[11px] text-editor-text-faint">free</span>
        </button>
        <button type="button" onClick={() => setActivePanel("caption")} className="flex items-center gap-2.5 rounded-editor-md border border-editor-border bg-editor-card px-3 py-2.5 text-left text-[12.5px] text-editor-text hover:border-editor-border-strong">
          <Captions className="h-4 w-4 text-editor-accent" /> Generate captions from speech
        </button>
        <button type="button" onClick={() => setPaletteOpen(true)} className="flex items-center gap-2.5 rounded-editor-md border border-editor-border bg-editor-card px-3 py-2.5 text-left text-[12.5px] text-editor-text hover:border-editor-border-strong">
          <Command className="h-4 w-4 text-[var(--primary)]" /> Find any command <span className="ml-auto text-[11px] text-editor-text-faint">Ctrl K</span>
        </button>
        <p className="flex items-start gap-1.5 px-0.5 text-[10.5px] leading-snug text-editor-text-faint"><Sparkles className="mt-0.5 h-3 w-3 flex-shrink-0" /> Changes from AI tools can be undone with Ctrl+Z.</p>
      </section>
    </div>
  );
}
