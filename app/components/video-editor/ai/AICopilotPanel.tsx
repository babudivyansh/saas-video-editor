"use client";

import { useState, useRef, useCallback } from "react";
import { useEditorStore } from "../store/editorStore";
import { T } from "../editorTheme";
import { describeOp, type EditorOp } from "@/lib/editor-ops";
import {
  detectFillerRanges, detectSilenceRanges, mainVideoClip, srcRangeToTimelineAll,
} from "@/lib/transcript-edit";
import { emptyTextClipData } from "@/lib/track-editor-types";
import type { CaptionSegment, VideoClipData } from "@/lib/track-editor-types";

interface Message { role: "user" | "assistant"; content: string; steps?: EditorOp[]; applied?: boolean }

function token() {
  return typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "";
}

const QUICK_ACTIONS = ["Cut the silences", "Remove filler words", "Make it 9:16 with captions", "Add a cinematic effect", "Speed up 1.5×"];

// Fetch (or reuse cached) transcript for the timeline's main video clip.
async function getTranscript(url: string): Promise<CaptionSegment[]> {
  const key = `ve_transcript:${url}`;
  const cached = sessionStorage.getItem(key);
  if (cached) return JSON.parse(cached);
  const res = await fetch("/api/editor/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
    body: JSON.stringify({ videoUrl: url }),
  });
  const data = await res.json() as { segments?: CaptionSegment[] };
  const segs = data.segments ?? [];
  if (segs.length) sessionStorage.setItem(key, JSON.stringify(segs));
  return segs;
}

export default function AICopilotPanel() {
  const setAICopilotOpen = useEditorStore(s => s.setAICopilotOpen);
  const present = useEditorStore(s => s.present);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! Tell me what to do and I'll plan the edits, then apply them on your OK. Try: \"cut the silences and add captions\"." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollDown = () => setTimeout(() => scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 50);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/editor/ai-copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ command: text, doc: useEditorStore.getState().present }),
      });
      const data = await res.json() as { message?: string; steps?: EditorOp[] };
      setMessages(prev => [...prev, { role: "assistant", content: data.message ?? "Done.", steps: data.steps ?? [] }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
      scrollDown();
    }
  }, [loading]);

  // Execute a planned op against the live store.
  async function runOp(op: EditorOp) {
    const s = useEditorStore.getState();
    const doc = s.present;
    const videoClips = doc.tracks.flatMap(t => t.clips.filter(c => c.data.kind === "video"));

    switch (op.op) {
      case "setAspect": s.setAspect(op.aspect); break;
      case "setSpeed":
        for (const c of videoClips) s.updateClipData(c.id, { speed: op.factor } as Partial<VideoClipData>);
        break;
      case "applyEffect":
        for (const c of videoClips) {
          const eff = (c.data as VideoClipData).effects ?? [];
          if (!eff.includes(op.effect)) s.updateClipData(c.id, { effects: [...eff, op.effect] } as Partial<VideoClipData>);
        }
        break;
      case "addCaptions": s.setCaptionStudioOpen(true); break;
      case "addText": {
        let textTrack = doc.tracks.find(t => t.kind === "text");
        if (!textTrack) { s.addTrack("text"); textTrack = useEditorStore.getState().present.tracks.find(t => t.kind === "text"); }
        if (textTrack) s.addClip(textTrack.id, { start: s.currentTime, duration: 3, srcIn: 0, srcOut: 3, data: emptyTextClipData(op.text) });
        break;
      }
      case "removeFillers":
      case "removeSilences": {
        const clip = mainVideoClip(doc);
        if (!clip || clip.data.kind !== "video") break;
        const segs = await getTranscript(clip.data.url);
        if (!segs.length) break;
        const srcRanges = op.op === "removeFillers"
          ? detectFillerRanges(segs)
          : detectSilenceRanges(segs, op.minGapSec ?? 0.7);
        const tl = srcRanges.flatMap(r => srcRangeToTimelineAll(useEditorStore.getState().present, r.start, r.end));
        if (tl.length) useEditorStore.getState().applyTimeCuts(tl);
        break;
      }
    }
  }

  async function applyPlan(idx: number) {
    const steps = messages[idx].steps;
    if (!steps || steps.length === 0 || applying) return;
    setApplying(true);
    try {
      for (const op of steps) {
        // eslint-disable-next-line no-await-in-loop
        await runOp(op);
      }
      setMessages(prev => prev.map((m, i) => i === idx ? { ...m, applied: true } : m));
      setMessages(prev => [...prev, { role: "assistant", content: "✓ Applied. Use ⌘Z to undo any step." }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Hit a snag applying that — some steps may have run." }]);
    } finally {
      setApplying(false);
      scrollDown();
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-end p-4" style={{ pointerEvents: "none" }}>
      <div className="flex flex-col rounded-2xl overflow-hidden" style={{ width: 384, height: 520, background: T.surface, border: `1px solid ${T.borderStrong}`, boxShadow: T.shadow, pointerEvents: "all" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${T.border}` }}>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${T.accent}, #8B5CF6)` }}>
              <svg viewBox="0 0 24 24" fill="white" className="w-3.5 h-3.5"><path d="M12 2l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /></svg>
            </div>
            <span className="text-sm font-bold" style={{ color: T.text }}>AI Co-Editor</span>
          </div>
          <button onClick={() => setAICopilotOpen(false)} style={{ color: T.textMuted }} className="hover:opacity-70">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
              <div className="rounded-xl px-3 py-2 text-xs max-w-[85%]" style={{ background: m.role === "user" ? T.accentSoft : T.surface2, color: m.role === "user" ? "#BFD0FF" : T.textMuted, border: `1px solid ${m.role === "user" ? T.accentRing : T.border}` }}>
                {m.content}
              </div>
              {/* Plan preview */}
              {m.steps && m.steps.length > 0 && (
                <div className="mt-1.5 w-[85%] rounded-xl p-2.5" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                  <ol className="space-y-1 mb-2">
                    {m.steps.map((op, j) => (
                      <li key={j} className="flex items-center gap-2 text-xs" style={{ color: T.text }}>
                        <span className="w-4 h-4 flex items-center justify-center rounded-full text-[9px] font-bold flex-shrink-0" style={{ background: T.accentSoft, color: T.accent }}>{j + 1}</span>
                        {describeOp(op)}
                      </li>
                    ))}
                  </ol>
                  {m.applied ? (
                    <span className="text-[11px] font-semibold" style={{ color: T.green }}>✓ Applied</span>
                  ) : (
                    <button onClick={() => applyPlan(i)} disabled={applying}
                      className="w-full py-1.5 rounded-lg text-xs font-bold transition-colors"
                      style={{ background: T.accent, color: "#fff", opacity: applying ? 0.6 : 1 }}>
                      {applying ? "Applying…" : `Apply ${m.steps.length} step${m.steps.length > 1 ? "s" : ""}`}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-xl px-3 py-2" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                <div className="flex gap-1">{[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: T.textFaint, animationDelay: `${i * 0.15}s` }} />)}</div>
              </div>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="px-3 py-1.5 flex flex-wrap gap-1" style={{ borderTop: `1px solid ${T.border}` }}>
          {QUICK_ACTIONS.map(a => (
            <button key={a} onClick={() => send(a)} className="rounded-full px-2 py-0.5 text-[11px] transition-all" style={{ background: T.surface2, color: T.textMuted, border: `1px solid ${T.border}` }}>
              {a}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="flex gap-2 px-3 py-2.5" style={{ borderTop: `1px solid ${T.border}` }}>
          <input
            type="text"
            placeholder="Tell me what to edit…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send(input)}
            disabled={loading}
            className="flex-1 rounded-lg px-3 py-2 text-xs outline-none"
            style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.text }}
          />
          <button onClick={() => send(input)} disabled={loading || !input.trim()} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: input.trim() ? T.accent : T.surface3, color: "white" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
