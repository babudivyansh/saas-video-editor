"use client";

import { useSimpleEditorStore, type AISuggestion } from "../store/simpleEditorStore";

const IMPACT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  high:   { bg: "rgba(239,68,68,0.1)",    text: "#fca5a5", dot: "#ef4444" },
  medium: { bg: "rgba(245,158,11,0.1)",   text: "#fcd34d", dot: "#f59e0b" },
  low:    { bg: "rgba(107,114,128,0.1)",  text: "#9ca3af", dot: "#6b7280" },
};

export default function AISuggestionsPanel() {
  const suggestions       = useSimpleEditorStore(s => s.suggestions);
  const applied           = useSimpleEditorStore(s => s.appliedSuggestions);
  const applySuggestion   = useSimpleEditorStore(s => s.applySuggestion);
  const setCaptionsEnabled = useSimpleEditorStore(s => s.setCaptionsEnabled);

  function handleApply(s: AISuggestion) {
    if (applied.includes(s.id)) return;
    if (s.id === "captions") setCaptionsEnabled(true);
    applySuggestion(s.id);
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: "#6b7280" }}>
        AI Suggestions
      </h3>

      {suggestions.map((s) => {
        const isApplied = applied.includes(s.id);
        const c = IMPACT_COLORS[s.impact] ?? IMPACT_COLORS.low;

        return (
          <div
            key={s.id}
            className="rounded-xl p-3 flex items-start gap-3 transition-all"
            style={{
              background: isApplied ? "rgba(34,197,94,0.08)" : "#111118",
              border: `1px solid ${isApplied ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)"}`,
              opacity: isApplied ? 0.7 : 1,
            }}
          >
            {/* Icon */}
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-base"
              style={{ background: isApplied ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.05)" }}
            >
              {isApplied ? "✓" : s.icon}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold leading-tight" style={{ color: isApplied ? "#86efac" : "#e5e7eb" }}>
                {s.title}
              </p>
              <p className="text-xs mt-0.5 leading-snug" style={{ color: "#6b7280" }}>
                {s.description}
              </p>
              {/* Impact badge */}
              <span
                className="inline-flex items-center gap-1 text-xs mt-1.5 px-1.5 py-0.5 rounded-md"
                style={{ background: c.bg, color: c.text }}
              >
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: c.dot }} />
                {s.impact} impact
              </span>
            </div>

            {/* Apply button */}
            {!isApplied && (
              <button
                onClick={() => handleApply(s)}
                className="flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                style={{ background: "rgba(124,58,237,0.15)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.25)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(124,58,237,0.3)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(124,58,237,0.15)"; }}
              >
                Apply
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
