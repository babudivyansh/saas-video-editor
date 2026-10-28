"use client";

// "AI write": describe the video in a line, pick hook / title / call to
// action, get a few lines back (POST /api/editor/ai-ideas — free, same daily
// allowance as the other AI text tools) and add any of them at the playhead.

import React, { useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { useAiIdeas } from "../../../hooks/useAiText";
import type { AiIdeaKind } from "@/lib/editor/ai-text";
import type { TextClip } from "@/lib/editor/types";
import { addTextAtPlayhead } from "./AddTextSection";
import { playUiSound } from "../../../hooks/useUiSound";

const KINDS: { id: AiIdeaKind; label: string; partial: Partial<TextClip> }[] = [
  { id: "hooks", label: "Hook", partial: { fontFamily: "Montserrat", fontSizePct: 0.06, bold: true, y: 0.22 } },
  { id: "titles", label: "Title", partial: { fontFamily: "Anton", fontSizePct: 0.07, bold: true, y: 0.18 } },
  { id: "ctas", label: "Call to action", partial: { fontFamily: "Poppins", fontSizePct: 0.045, bold: true, y: 0.8, bgColor: "#dc2626" } },
];

export default function AiWriteSection() {
  const [brief, setBrief] = useState("");
  const [kind, setKind] = useState<AiIdeaKind>("hooks");
  const [ideas, setIdeas] = useState<string[]>([]);
  const { write, working, error } = useAiIdeas();
  const current = KINDS.find((k) => k.id === kind)!;

  const run = async () => {
    playUiSound("think");
    const out = await write(kind, brief);
    if (out) {
      setIdeas(out);
      playUiSound("magic");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="ai-write-brief" className="px-0.5 text-[11px] font-bold uppercase tracking-wide text-editor-text-muted">
        What&apos;s the video about?
      </label>
      <textarea
        id="ai-write-brief"
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="e.g. 3 habits that changed my mornings"
        className="resize-none rounded-editor-md border border-editor-border-strong bg-black/30 p-2.5 text-[12.5px] text-editor-text outline-none transition-[border-color,box-shadow] placeholder:text-editor-text-faint focus:border-editor-accent focus:shadow-[0_0_0_3px_rgba(32,214,138,0.15)]"
      />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="What to write">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            aria-pressed={kind === k.id}
            onClick={() => {
              setKind(k.id);
              playUiSound("chip");
            }}
            className={`editor-press h-7 rounded-full border px-3 text-[12px] font-medium ${
              kind === k.id ? "border-editor-accent bg-editor-accent/15 text-editor-accent" : "border-editor-border-strong text-editor-text-muted hover:text-editor-text"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => void run()}
        disabled={working || !brief.trim()}
        className={`editor-press flex h-10 items-center justify-center gap-1.5 rounded-editor-md text-[13px] font-bold disabled:cursor-not-allowed ${
          working ? "editor-thinking text-editor-text" : "bg-editor-accent text-editor-bg disabled:opacity-40"
        }`}
      >
        <Sparkles className="h-4 w-4" />
        {working ? "Writing…" : `Write ${current.label.toLowerCase()} ideas`}
      </button>
      {error && <p role="alert" className="text-[12px] text-red-400">{error}</p>}
      {ideas.length > 0 && (
        <div className="editor-stagger flex flex-col gap-1.5" aria-live="polite">
          {ideas.map((line) => (
            <div key={line} className="flex items-center gap-2 rounded-editor-md border border-editor-border bg-editor-card px-3 py-2.5 text-[12.5px] leading-snug text-editor-text transition-[transform,border-color] hover:translate-x-0.5 hover:border-editor-accent/40">
              <span className="min-w-0 flex-1">{line}</span>
              <button
                type="button"
                aria-label={`Add “${line}” to the video`}
                onClick={() => addTextAtPlayhead(line, current.partial, current.label)}
                className="editor-press flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-editor-sm border border-editor-border-strong text-editor-text-muted hover:border-editor-accent hover:text-editor-accent"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="px-0.5 text-[10.5px] text-editor-text-faint">Free · counts toward your daily AI rewrites (5 on free, 50 on paid plans).</p>
    </div>
  );
}
