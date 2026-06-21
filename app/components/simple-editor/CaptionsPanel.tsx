"use client";

import { useRef, useState } from "react";
import type { Caption } from "./types";
import { parseSRT } from "./srtParser";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

interface Props {
  captions: Caption[];
  currentTime: number;
  onUpdate: (c: Caption) => void;
  onAdd: (c: Caption) => void;
  onRemove: (id: string) => void;
  onReplace: (captions: Caption[]) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export default function CaptionsPanel({
  captions, currentTime, onUpdate, onAdd, onRemove, onReplace, collapsed, onToggle,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  async function handleSRT(file: File) {
    const text = await file.text();
    const parsed = parseSRT(text);
    if (parsed.length === 0) return;
    onReplace(parsed);
  }

  function startEdit(c: Caption) {
    setEditingId(c.id);
    setEditText(c.text);
  }

  function commitEdit(c: Caption) {
    onUpdate({ ...c, text: editText });
    setEditingId(null);
  }

  function addAtCurrent() {
    onAdd({
      id: Math.random().toString(36).slice(2),
      startTime: currentTime,
      endTime: Math.min(currentTime + 3, currentTime + 3),
      text: "New caption",
    });
  }

  return (
    <div className="border-t border-white/5">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-gray-300 hover:bg-white/[0.03] transition-colors"
      >
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="10" rx="2"/><line x1="6" y1="12" x2="18" y2="12"/></svg>
          Captions
          {captions.length > 0 && (
            <span className="bg-[#7C3AED]/20 text-[#7C3AED] text-xs px-1.5 py-0.5 rounded-full">{captions.length}</span>
          )}
        </span>
        <span className={`text-gray-500 transition-transform ${collapsed ? "" : "rotate-180"}`}>▲</span>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-2">
          {/* Actions row */}
          <div className="flex gap-2">
            <button
              onClick={addAtCurrent}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7C3AED]/20 hover:bg-[#7C3AED]/30 text-[#7C3AED] text-xs font-semibold transition-colors"
            >
              + Add caption
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-gray-300 text-xs font-semibold transition-colors"
            >
              Import SRT
            </button>
            {captions.length > 0 && (
              <button
                onClick={() => onReplace([])}
                className="ml-auto px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-red-400 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          <input ref={fileRef} type="file" accept=".srt" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleSRT(f); e.target.value = ""; }} />

          {/* Caption list */}
          {captions.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-3">
              No captions. Import an SRT file or add manually.
            </p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {captions.map(c => {
                const isActive = currentTime >= c.startTime && currentTime <= c.endTime;
                return (
                  <div key={c.id}
                    className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${isActive ? "bg-[#7C3AED]/15 border border-[#7C3AED]/30" : "bg-white/[0.03] border border-transparent"}`}>
                    <span className="text-gray-500 shrink-0 font-mono pt-0.5">
                      {fmt(c.startTime)} → {fmt(c.endTime)}
                    </span>
                    {editingId === c.id ? (
                      <input
                        autoFocus
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        onBlur={() => commitEdit(c)}
                        onKeyDown={e => e.key === "Enter" && commitEdit(c)}
                        className="flex-1 bg-transparent text-white focus:outline-none border-b border-[#7C3AED]"
                      />
                    ) : (
                      <span
                        className="flex-1 text-gray-200 cursor-text"
                        onClick={() => startEdit(c)}
                        title="Click to edit"
                      >
                        {c.text}
                      </span>
                    )}
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => startEdit(c)} className="text-gray-500 hover:text-white transition-colors" aria-label="Edit">✎</button>
                      <button onClick={() => onRemove(c.id)} className="text-gray-500 hover:text-red-400 transition-colors" aria-label="Delete">✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
