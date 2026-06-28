"use client";

import { useState, useCallback } from "react";
import { useEditorStore } from "../store/editorStore";

interface Suggestion { text: string; priority: "high" | "medium" | "low" }
interface AnalysisResult { viralScore: number; hookScore: number; pacingScore: number; suggestions: Suggestion[] }

function token() {
  return typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "";
}

export default function ReelsOptimizer() {
  const setReelsOptimizerOpen = useEditorStore(s => s.setReelsOptimizerOpen);
  const present = useEditorStore(s => s.present);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");

  const analyze = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/editor/ai-optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ doc: present }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Analysis failed"); return; }
      setResult(data);
    } catch {
      setError("Failed to connect.");
    } finally {
      setLoading(false);
    }
  }, [present]);

  const priorityColor: Record<string, string> = { high: "#ef4444", medium: "#f59e0b", low: "#15a66b" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
      <div className="flex flex-col rounded-2xl shadow-2xl overflow-hidden" style={{ width: 460, maxHeight: "80vh", background: "#ffffff", border: "1px solid #e4e7ec" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #e4e7ec" }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: "#15181f" }}>🚀 Reels Optimizer</h2>
            <p className="text-xs mt-0.5" style={{ color: "#98a0ae" }}>AI analysis for viral potential</p>
          </div>
          <button onClick={() => setReelsOptimizerOpen(false)} style={{ color: "#5a6170" }} className="hover:text-gray-900 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
              <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {!result ? (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="text-5xl">🎯</div>
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: "#15181f" }}>Analyze your video</p>
                <p className="text-xs mt-1" style={{ color: "#98a0ae" }}>Get a viral score and improvement suggestions</p>
              </div>
              {error && <p className="text-xs" style={{ color: "#e5484d" }}>{error}</p>}
              <button
                onClick={analyze}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)", color: "white" }}
              >
                {loading ? <><Spinner /> Analyzing…</> : "🔍 Analyze Video"}
              </button>
            </div>
          ) : (
            <>
              {/* Scores */}
              <div className="grid grid-cols-3 gap-2">
                <ScoreCard label="Viral Score" score={result.viralScore} accent="#f59e0b" />
                <ScoreCard label="Hook" score={result.hookScore} accent="#335cff" />
                <ScoreCard label="Pacing" score={result.pacingScore} accent="#15a66b" />
              </div>

              {/* Suggestions */}
              {result.suggestions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#98a0ae" }}>Suggestions</p>
                  <div className="flex flex-col gap-1.5">
                    {result.suggestions.map((s, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: "#f6f7f9", border: "1px solid #e4e7ec" }}>
                        <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ background: priorityColor[s.priority] }} />
                        <p className="text-xs" style={{ color: "#5a6170" }}>{s.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={analyze} disabled={loading} className="text-xs transition-colors" style={{ color: "#98a0ae" }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#15181f")}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#98a0ae")}
              >
                Re-analyze
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ScoreCard({ label, score, accent }: { label: string; score: number; accent: string }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: "#f6f7f9", border: `1px solid ${accent}33` }}>
      <div className="text-2xl font-bold tabular-nums" style={{ color: accent }}>{score}</div>
      <div className="text-xs mt-0.5" style={{ color: "#98a0ae" }}>{label}</div>
      <div className="mt-2 h-1 rounded-full" style={{ background: "#e4e7ec" }}>
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: accent }} />
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "white", borderTopColor: "transparent" }} />;
}
