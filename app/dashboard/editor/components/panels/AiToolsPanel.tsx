"use client";

// "AI tools" rail tab — three tabs (header + tab bar live in SidebarTabs):
//   Selection     rewrite / shorten / translate… the selected text clip or caption.
//   All captions  one-click clean-ups across every caption.
//   Video         remove silences, captions from speech, the command palette.

import React, { useState } from "react";
import { Captions, Command, Scissors, Smile, Sparkles, WrapText } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import { AI_TEXT_ACTIONS, applyFreeOperation, useAiText } from "../../hooks/useAiText";
import type { AiTextOperation } from "@/lib/editor/ai-text";
import { realignWords } from "@/lib/editor/caption-words";
import { showPanelToast } from "../ui";
import { playUiSound } from "../../hooks/useUiSound";

const LANGS = ["Spanish", "Hindi", "French", "German", "Portuguese", "Arabic", "Japanese"];

const tag = (free: boolean) =>
  `ml-auto flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${free ? "bg-editor-accent/15 text-editor-accent" : "bg-editor-elevated text-editor-text-muted"}`;
const row =
  "editor-press flex w-full items-center gap-2.5 rounded-editor-md border border-editor-border bg-editor-card px-3 py-2.5 text-left text-[12.5px] text-editor-text hover:border-editor-accent/50 disabled:cursor-not-allowed disabled:opacity-40";

export default function AiToolsPanel({ tab }: { tab: "selection" | "captions" | "video" }) {
  if (tab === "captions") return <AllCaptionsTab />;
  if (tab === "video") return <VideoTab />;
  return <SelectionTab />;
}

function SelectionTab() {
  const doc = useEditorStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const updateClip = useEditorStore((s) => s.updateClip);
  const { run, working, error } = useAiText();
  const [lang, setLang] = useState(LANGS[0]);

  const target =
    selection?.track === "text" ? doc.tracks.text.find((c) => c.id === selection.clipId) :
    selection?.track === "caption" ? doc.tracks.caption.find((c) => c.id === selection.clipId) :
    undefined;

  async function onAction(op: AiTextOperation, label: string) {
    if (!target || !selection) return;
    const free = applyFreeOperation(op, target.text) !== null;
    if (!free) playUiSound("think");
    const out = await run(op, target.text, op === "translate" ? lang : undefined);
    if (out == null) return;
    // Text clips: an AI edit replaces the wording, so the rich-text doc goes
    // with it (see TextClipProps.tsx for why).
    if (selection.track === "text") updateClip("text", selection.clipId, { text: out, richText: undefined });
    else updateClip("caption", selection.clipId, { text: out, words: realignWords("words" in target ? target.words : undefined, out) });
    playUiSound(free ? "go" : "magic");
    showPanelToast(`${label} done · Ctrl+Z to undo`);
  }

  return (
    <div className="editor-stagger flex flex-col gap-3 p-3">
      {target ? (
        <div className={`rounded-editor-md border p-3 text-[12.5px] leading-snug text-editor-text transition-colors ${working ? "editor-thinking border-editor-accent/50" : "border-editor-border bg-editor-card"}`} aria-live="polite">
          <span className={`mb-1 block text-[10.5px] font-bold uppercase tracking-wide ${selection?.track === "caption" ? "text-editor-track-caption" : "text-editor-track-text"}`}>
            {selection?.track === "caption" ? "Caption" : "Text"}
          </span>
          {working ? <span className="text-editor-text-muted">Thinking…</span> : <span key={target.text} className="editor-pop block">“{target.text.slice(0, 140)}{target.text.length > 140 ? "…" : ""}”</span>}
        </div>
      ) : (
        <p className="rounded-editor-md border border-dashed border-editor-border-strong p-3 text-[12px] text-editor-text-muted">
          Select a text clip or a caption on the timeline to rewrite, shorten, translate or tidy it.
        </p>
      )}
      <div className="editor-stagger-grid flex flex-col gap-1.5">
        {AI_TEXT_ACTIONS.filter((a) => a.op !== "translate").map((a) => (
          <button key={a.op} type="button" disabled={!target || !!working} onClick={() => void onAction(a.op, a.label)} className={row}>
            {working === a.op ? "Working…" : a.label}
            <span className={tag(!!a.free)}>{a.free ? "INSTANT" : "AI"}</span>
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Translate to"
                className="flex-1 rounded-editor-md border border-editor-border bg-editor-card px-2 py-2 text-[12px] text-editor-text outline-none">
          {LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <button type="button" disabled={!target || !!working} onClick={() => void onAction("translate", `Translated to ${lang}`)}
                className="editor-press rounded-editor-md border border-editor-border bg-editor-card px-3 py-2 text-[12px] font-semibold text-editor-text hover:border-editor-accent/50 disabled:cursor-not-allowed disabled:opacity-40">
          {working === "translate" ? "Working…" : "Translate"}
        </button>
      </div>
      {error && <p role="alert" className="text-[12px] text-red-400">{error}</p>}
      <p className="px-0.5 text-[10.5px] leading-snug text-editor-text-faint">AI rewrites are free: 5 a day on the free plan, 50 on paid plans. “Instant” ones don&apos;t count.</p>
    </div>
  );
}

const BULK: { op: AiTextOperation; label: string; hint: string; icon: typeof Scissors }[] = [
  { op: "fillerWords", label: "Remove filler words", hint: "“um”, “like”, “you know”", icon: Scissors },
  { op: "emojis", label: "Add emojis", hint: "one where it fits", icon: Smile },
  { op: "lineBreaks", label: "Auto line breaks", hint: "balanced two-line cues", icon: WrapText },
];

function AllCaptionsTab() {
  const captionCount = useEditorStore((s) => s.doc.tracks.caption.length);
  const applyToCaptions = useEditorStore((s) => s.applyCaptionTextEdit);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);

  return (
    <div className="editor-stagger flex flex-col gap-3 p-3">
      <p className="px-0.5 text-[12px] text-editor-text-muted">
        {captionCount > 0 ? `${captionCount} caption${captionCount === 1 ? "" : "s"} on the timeline.` : "No captions yet."}
      </p>
      {captionCount === 0 ? (
        <button type="button" onClick={() => setActivePanel("caption")} className={row}>
          <Captions className="h-4 w-4 text-editor-accent" /> Generate captions from speech
        </button>
      ) : (
        BULK.map(({ op, label, hint, icon: Icon }) => (
          <button
            key={op}
            type="button"
            onClick={() => {
              const changed = applyToCaptions((text) => applyFreeOperation(op, text) ?? text);
              playUiSound(changed > 0 ? "go" : "tap");
              showPanelToast(changed > 0 ? `${label}: ${changed} caption${changed === 1 ? "" : "s"} changed` : `${label}: nothing to change`);
            }}
            className={row}
          >
            <Icon className="h-4 w-4 text-editor-accent" />
            <span className="min-w-0">
              <span className="block">{label}</span>
              <span className="block text-[11px] text-editor-text-faint">{hint}</span>
            </span>
            <span className={tag(true)}>INSTANT</span>
          </button>
        ))
      )}
      {captionCount > 0 && (
        <button type="button" onClick={() => setActivePanel("captionEdit")} className={row}>
          <Scissors className="h-4 w-4 text-warning" /> Cut filler words out of the video too…
        </button>
      )}
      <p className="flex items-start gap-1.5 px-0.5 text-[10.5px] leading-snug text-editor-text-faint">
        <Sparkles className="mt-0.5 h-3 w-3 flex-shrink-0" /> Every change can be undone with Ctrl+Z.
      </p>
    </div>
  );
}

function VideoTab() {
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const setPaletteOpen = useEditorStore((s) => s.setPaletteOpen);
  const setSilenceOpen = useEditorStore((s) => s.setSilenceOpen);
  const hasVideo = useEditorStore((s) => s.doc.tracks.video.length > 0);

  return (
    <div className="editor-stagger flex flex-col gap-3 p-3">
      <button type="button" disabled={!hasVideo} onClick={() => { playUiSound("snip"); setSilenceOpen(true); }} className={row}>
        <Scissors className="h-4 w-4 text-editor-accent" />
        <span className="min-w-0">
          <span className="block">Remove silences</span>
          <span className="block text-[11px] text-editor-text-faint">Find the pauses, preview, cut them in one go</span>
        </span>
        <span className={tag(true)}>FREE</span>
      </button>
      <button type="button" onClick={() => setActivePanel("caption")} className={row}>
        <Captions className="h-4 w-4 text-editor-accent" />
        <span className="min-w-0">
          <span className="block">Generate captions</span>
          <span className="block text-[11px] text-editor-text-faint">From speech · opens the Captions panel</span>
        </span>
        <span className={tag(false)}>1 MIN/MIN</span>
      </button>
      <button type="button" onClick={() => setPaletteOpen(true)} className={row}>
        <Command className="h-4 w-4 text-[var(--primary)]" /> Find any command <span className="ml-auto text-[11px] text-editor-text-faint">Ctrl K</span>
      </button>
      {!hasVideo && <p className="px-0.5 text-[11px] text-editor-text-faint">Add a video clip first to remove its silences.</p>}
    </div>
  );
}
