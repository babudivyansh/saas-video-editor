"use client";

import { useState } from "react";
import { useEditorStore } from "../store/editorStore";
import {
  type VideoClipData,
  type TextClipData,
  emptyTextClipData,
  uid,
} from "@/lib/track-editor-types";

interface Suggestion {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  action: "split" | "add-text" | "trim" | "remove" | "speed" | "info";
  params?: Record<string, number | string>;
}

const PRIORITY_COLOR: Record<Suggestion["priority"], string> = {
  high:   "#ef4444",
  medium: "#f59e0b",
  low:    "#22c55e",
};

function token() {
  return typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "";
}

export default function AutoEditSuggestions() {
  const setAutoEditOpen = useEditorStore(s => s.setAutoEditOpen);
  const present = useEditorStore(s => s.present);
  const splitClipAtTime = useEditorStore(s => s.splitClipAtTime);
  const addClip = useEditorStore(s => s.addClip);
  const updateClipData = useEditorStore(s => s.updateClipData);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  async function analyze() {
    setLoading(true);
    setError("");
    setSuggestions([]);

    try {
      const res = await fetch("/api/editor/ai-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ doc: present }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setSuggestions((data.suggestions as Suggestion[]).map(s => ({ ...s, id: uid() })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to analyze");
    } finally {
      setLoading(false);
    }
  }

  function applySuggestion(s: Suggestion) {
    try {
      if (s.action === "split" && s.params?.clipId && s.params?.time !== undefined) {
        splitClipAtTime(String(s.params.clipId), Number(s.params.time));
      } else if (s.action === "add-text" && s.params?.text) {
        const textTracks = present.tracks.filter(t => t.kind === "text");
        if (textTracks.length > 0) {
          const d = emptyTextClipData(String(s.params.text));
          const start = Number(s.params.start ?? 0);
          const duration = Number(s.params.duration ?? 3);
          addClip(textTracks[0].id, {
            start,
            duration,
            srcIn: 0,
            srcOut: duration,
            data: d,
          });
        }
      } else if (s.action === "speed" && s.params?.clipId && s.params?.speed !== undefined) {
        updateClipData(String(s.params.clipId), { speed: Number(s.params.speed) } as Partial<VideoClipData>);
      }
      setApplied(prev => new Set([...prev, s.id]));
    } catch {
      // Silently ignore if action can't be applied
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
    >
      <div
        className="relative flex flex-col rounded-2xl overflow-hidden"
        style={{ width: 560, maxHeight: "85vh", background: "#0d0d0f", border: "1px solid #27272a" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #1c1c1e" }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: "#e4e4e7" }}>✂️ Auto Edit</h2>
            <p className="text-xs mt-0.5" style={{ color: "#52525b" }}>AI-suggested edits based on your timeline</p>
          </div>
          <button
            onClick={() => setAutoEditOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ background: "#1a1a1e", color: "#71717a" }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* Analyze button */}
          {suggestions.length === 0 && !loading && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                style={{ background: "#1a1a1e" }}
              >
                🤖
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold" style={{ color: "#e4e4e7" }}>Analyze your timeline</p>
                <p className="text-xs mt-1" style={{ color: "#52525b" }}>
                  Gemini will review your clips and suggest pacing, text, and cut improvements
                </p>
              </div>
              {error && (
                <p className="text-xs text-center" style={{ color: "#ef4444" }}>{error}</p>
              )}
              <button
                onClick={analyze}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "#fff" }}
              >
                Analyze Timeline
              </button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ background: "#6366f1", animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              <p className="text-sm" style={{ color: "#71717a" }}>Analyzing your timeline…</p>
            </div>
          )}

          {suggestions.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold" style={{ color: "#71717a" }}>
                  {suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""} found
                </p>
                <button
                  onClick={analyze}
                  className="text-xs px-3 py-1 rounded-lg transition-colors"
                  style={{ background: "#1a1a1e", color: "#6366f1" }}
                >
                  Re-analyze
                </button>
              </div>

              {suggestions.map(s => {
                const done = applied.has(s.id);
                return (
                  <div
                    key={s.id}
                    className="rounded-xl p-4 flex items-start gap-3"
                    style={{
                      background: "#111113",
                      border: `1px solid ${done ? "#22c55e33" : "#27272a"}`,
                      opacity: done ? 0.7 : 1,
                    }}
                  >
                    <div
                      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{ background: PRIORITY_COLOR[s.priority] }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: "#e4e4e7" }}>{s.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: "#52525b" }}>{s.description}</p>
                    </div>
                    {s.action !== "info" && (
                      <button
                        onClick={() => applySuggestion(s)}
                        disabled={done}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold flex-shrink-0 transition-all"
                        style={{
                          background: done ? "#1a1a1e" : "#3b82f622",
                          color: done ? "#52525b" : "#3b82f6",
                          border: `1px solid ${done ? "#27272a" : "#3b82f633"}`,
                          cursor: done ? "default" : "pointer",
                        }}
                      >
                        {done ? "✓ Applied" : "Apply"}
                      </button>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
