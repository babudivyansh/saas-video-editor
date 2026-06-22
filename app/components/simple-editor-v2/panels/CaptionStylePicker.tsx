"use client";

import { useSimpleEditorStore } from "../store/simpleEditorStore";
import { CAPTION_STYLES } from "@/lib/caption-styles";

// Map spec names → CAPTION_STYLES indices
const FEATURED = [
  { name: "Viral Creator",  index: 0,  emoji: "🔥" },
  { name: "Alex Hormozi",   index: 10, emoji: "💪" },
  { name: "MrBeast",        index: 13, emoji: "⚡" },
  { name: "Podcast",        index: 11, emoji: "🎙" },
  { name: "Minimal",        index: 2,  emoji: "✦" },
  { name: "Modern",         index: 1,  emoji: "💎" },
  { name: "Gaming",         index: 7,  emoji: "🎮" },
  { name: "Business",       index: 6,  emoji: "📊" },
];

export default function CaptionStylePicker() {
  const captionStyleIndex  = useSimpleEditorStore(s => s.captionStyleIndex);
  const captionsEnabled    = useSimpleEditorStore(s => s.captionsEnabled);
  const setCaptionStyle    = useSimpleEditorStore(s => s.setCaptionStyle);
  const setCaptionsEnabled = useSimpleEditorStore(s => s.setCaptionsEnabled);

  return (
    <div className="flex flex-col gap-3">
      {/* Header with toggle */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#6b7280" }}>
          Caption Style
        </h3>
        <button
          onClick={() => setCaptionsEnabled(!captionsEnabled)}
          className="flex items-center gap-1.5 text-xs transition-all"
          style={{ color: captionsEnabled ? "#a78bfa" : "#4b5563" }}
        >
          <div
            className="w-8 h-4 rounded-full relative transition-all"
            style={{ background: captionsEnabled ? "#7C3AED" : "rgba(255,255,255,0.1)" }}
          >
            <div
              className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
              style={{ left: captionsEnabled ? "calc(100% - 14px)" : "2px" }}
            />
          </div>
          {captionsEnabled ? "On" : "Off"}
        </button>
      </div>

      {/* Style grid */}
      <div className="grid grid-cols-2 gap-2">
        {FEATURED.map(({ name, index, emoji }) => {
          const style = CAPTION_STYLES[index];
          const isActive = captionStyleIndex === index && captionsEnabled;

          return (
            <button
              key={index}
              onClick={() => setCaptionStyle(index)}
              className="rounded-xl p-3 text-left transition-all relative overflow-hidden"
              style={{
                background: isActive ? "rgba(124,58,237,0.12)" : "#111118",
                border: `1px solid ${isActive ? "#7C3AED" : "rgba(255,255,255,0.06)"}`,
              }}
            >
              {/* Preview text */}
              <div
                className="rounded-lg px-2 py-2 mb-2 text-center overflow-hidden"
                style={{ background: "#000", height: 44 }}
              >
                <span
                  className="text-sm leading-tight block truncate"
                  style={{
                    fontFamily: style.fontFamily,
                    fontWeight: style.weight,
                    fontStyle: style.italic ? "italic" : "normal",
                    textTransform: style.uppercase ? "uppercase" : "none",
                    color: style.highlight,
                  }}
                >
                  Hello World
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-sm">{emoji}</span>
                <span className="text-xs font-medium truncate" style={{ color: isActive ? "#c4b5fd" : "#9ca3af" }}>
                  {name}
                </span>
              </div>

              {isActive && (
                <div
                  className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center text-xs"
                  style={{ background: "#7C3AED", color: "white" }}
                >
                  ✓
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* All styles row */}
      <div className="flex gap-1.5 flex-wrap">
        {CAPTION_STYLES.map((style, i) => {
          if (FEATURED.some(f => f.index === i)) return null;
          const isActive = captionStyleIndex === i && captionsEnabled;
          return (
            <button
              key={i}
              onClick={() => setCaptionStyle(i)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
              style={{
                background: isActive ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${isActive ? "#7C3AED" : "rgba(255,255,255,0.06)"}`,
                color: isActive ? "#c4b5fd" : "#6b7280",
                fontFamily: style.fontFamily,
                fontWeight: style.weight,
              }}
            >
              {style.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
