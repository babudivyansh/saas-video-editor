"use client";

import { useEditorStore } from "../store/editorStore";
import { CAPTION_STYLES } from "@/lib/caption-styles";

export default function CaptionsPanelVE() {
  const setCaptionStudioOpen = useEditorStore(s => s.setCaptionStudioOpen);

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Generate captions CTA */}
      <button
        onClick={() => setCaptionStudioOpen(true)}
        className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-semibold transition-all"
        style={{ background: "linear-gradient(135deg,#335cff,#335cff)", color: "white" }}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = "0.9")}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = "1")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
          <path d="M12 8v4l3 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Auto-Generate Captions
      </button>

      {/* Caption style picker */}
      <div>
        <p className="text-xs font-medium mb-2" style={{ color: "#5a6170" }}>Caption Styles</p>
        <div className="grid grid-cols-2 gap-1.5">
          {CAPTION_STYLES.map((style, idx) => (
            <CaptionStyleCard key={idx} label={style.label} color={style.color} highlight={style.highlight} fontFamily={style.fontFamily} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CaptionStyleCard({ label, color, highlight, fontFamily }: { label: string; color: string; highlight: string; fontFamily: string }) {
  return (
    <button
      className="flex flex-col items-center justify-center rounded-lg px-2 py-3 transition-all"
      style={{ background: "#e4e7ec", border: "1px solid #e4e7ec", gap: 4 }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = "#d3d8e0")}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = "#e4e7ec")}
    >
      <div className="flex gap-0.5">
        <span style={{ color, fontFamily, fontSize: 11, fontWeight: 700 }}>WORD </span>
        <span style={{ color: highlight, fontFamily, fontSize: 11, fontWeight: 700 }}>WORD</span>
      </div>
      <span className="text-xs" style={{ color: "#98a0ae", fontSize: 9 }}>{label}</span>
    </button>
  );
}
