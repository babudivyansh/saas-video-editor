"use client";

import { useState } from "react";
import type { TextOverlay } from "../types";

const COLORS = ["#ffffff", "#000000", "#facc15", "#f87171", "#34d399", "#60a5fa", "#e879f9"];

interface Props {
  overlays: TextOverlay[];
  onAdd: (o: TextOverlay) => void;
  onUpdate: (o: TextOverlay) => void;
  onRemove: (id: string) => void;
}

const blank = (): TextOverlay => ({
  id: Math.random().toString(36).slice(2),
  text: "",
  fontSize: "md",
  color: "#ffffff",
  position: "bottom",
  bold: false,
  italic: false,
});

export default function TextOverlayPanel({ overlays, onAdd, onUpdate, onRemove }: Props) {
  const [draft, setDraft] = useState<TextOverlay>(blank());

  const commit = () => {
    if (!draft.text.trim()) return;
    onAdd(draft);
    setDraft(blank());
  };

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-bold text-white">Text Overlay</h3>

      {/* New overlay form */}
      <div className="space-y-3 border border-white/10 rounded-xl p-3">
        <textarea
          value={draft.text}
          onChange={e => setDraft(d => ({ ...d, text: e.target.value }))}
          placeholder="Enter text…"
          rows={2}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#7C3AED] resize-none"
        />

        <div className="flex gap-1">
          {(["sm", "md", "lg"] as const).map(s => (
            <button key={s} onClick={() => setDraft(d => ({ ...d, fontSize: s }))}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${draft.fontSize === s ? "bg-[#7C3AED] border-[#7C3AED] text-white" : "border-white/10 text-gray-300 hover:bg-white/5"}`}>
              {s.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          {(["top", "center", "bottom"] as const).map(p => (
            <button key={p} onClick={() => setDraft(d => ({ ...d, position: p }))}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border capitalize transition-colors ${draft.position === p ? "bg-[#7C3AED] border-[#7C3AED] text-white" : "border-white/10 text-gray-300 hover:bg-white/5"}`}>
              {p}
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          <div className="flex gap-1.5">
            {COLORS.map(c => (
              <button key={c} onClick={() => setDraft(d => ({ ...d, color: c }))}
                className={`w-5 h-5 rounded-full border-2 transition-all ${draft.color === c ? "border-white scale-110" : "border-transparent"}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="ml-auto flex gap-1">
            <button onClick={() => setDraft(d => ({ ...d, bold: !d.bold }))}
              className={`px-2.5 py-1 rounded text-xs font-bold border transition-colors ${draft.bold ? "bg-[#7C3AED] border-[#7C3AED] text-white" : "border-white/10 text-gray-300"}`}>B</button>
            <button onClick={() => setDraft(d => ({ ...d, italic: !d.italic }))}
              className={`px-2.5 py-1 rounded text-xs italic border transition-colors ${draft.italic ? "bg-[#7C3AED] border-[#7C3AED] text-white" : "border-white/10 text-gray-300"}`}>I</button>
          </div>
        </div>

        <button onClick={commit} disabled={!draft.text.trim()}
          className="w-full py-2 rounded-lg bg-[#7C3AED] hover:bg-[#6d28d9] disabled:opacity-40 text-white text-sm font-semibold transition-colors">
          Add Text
        </button>
      </div>

      {/* Existing overlays */}
      {overlays.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Added overlays</p>
          {overlays.map(o => (
            <div key={o.id} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
              <span className="flex-1 text-sm text-white truncate" style={{ color: o.color, fontWeight: o.bold ? 700 : 400, fontStyle: o.italic ? "italic" : "normal" }}>
                {o.text}
              </span>
              <span className="text-xs text-gray-500 capitalize">{o.position}</span>
              <button onClick={() => onRemove(o.id)} className="text-gray-500 hover:text-red-400 transition-colors text-xs">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
