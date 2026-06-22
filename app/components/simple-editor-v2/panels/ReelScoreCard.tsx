"use client";

import { useSimpleEditorStore } from "../store/simpleEditorStore";

const METRICS = [
  { key: "hookScore",        label: "Hook Strength",       color: "#f59e0b" },
  { key: "captionScore",     label: "Caption Quality",     color: "#7C3AED" },
  { key: "audioScore",       label: "Audio Quality",       color: "#22c55e" },
  { key: "engagementScore",  label: "Engagement",          color: "#3b82f6" },
  { key: "visualScore",      label: "Visual Energy",       color: "#ec4899" },
] as const;

function ScoreRing({ score }: { score: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const dash = circ * (1 - pct / 100);

  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
        <circle
          cx="64" cy="64" r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={dash}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1), stroke 0.5s" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold text-white leading-none">{pct}</span>
        <span className="text-xs mt-0.5" style={{ color: "#6b7280" }}>/ 100</span>
      </div>
    </div>
  );
}

export default function ReelScoreCard() {
  const reelScore       = useSimpleEditorStore(s => s.reelScore);
  const hookScore       = useSimpleEditorStore(s => s.hookScore);
  const captionScore    = useSimpleEditorStore(s => s.captionScore);
  const audioScore      = useSimpleEditorStore(s => s.audioScore);
  const engagementScore = useSimpleEditorStore(s => s.engagementScore);
  const visualScore     = useSimpleEditorStore(s => s.visualScore);

  const metricValues: Record<string, number> = { hookScore, captionScore, audioScore, engagementScore, visualScore };

  const label = reelScore >= 75 ? "Great potential!" : reelScore >= 50 ? "Good start" : "Needs improvement";

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#6b7280" }}>
        Reel Score
      </h3>

      {/* Big ring */}
      <div className="flex flex-col items-center gap-1 mb-5">
        <ScoreRing score={reelScore} />
        <p className="text-sm font-medium" style={{ color: "#9ca3af" }}>{label}</p>
      </div>

      {/* Metric bars */}
      <div className="flex flex-col gap-2.5">
        {METRICS.map(m => {
          const val = metricValues[m.key] ?? 0;
          return (
            <div key={m.key}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs" style={{ color: "#9ca3af" }}>{m.label}</span>
                <span className="text-xs font-medium text-white">{val}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${val}%`,
                    background: m.color,
                    transition: "width 1s cubic-bezier(0.4,0,0.2,1)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Tip */}
      {captionScore === 0 && (
        <div
          className="mt-4 rounded-xl px-3 py-2.5 text-xs"
          style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)", color: "#c4b5fd" }}
        >
          ✦ Adding captions could improve engagement by 27%
        </div>
      )}
    </div>
  );
}
