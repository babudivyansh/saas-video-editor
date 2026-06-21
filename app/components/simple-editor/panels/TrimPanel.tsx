"use client";

import type { TrimRange } from "../types";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function parse(v: string): number {
  const [m, s] = v.split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
}

interface Props {
  trim: TrimRange;
  duration: number;
  onChange: (t: TrimRange) => void;
}

export default function TrimPanel({ trim, duration, onChange }: Props) {
  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-bold text-white">Trim</h3>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Start time</label>
          <input
            type="text"
            defaultValue={fmt(trim.start)}
            onBlur={e => {
              const v = parse(e.target.value);
              if (!isNaN(v)) onChange({ start: Math.max(0, Math.min(v, trim.end - 1)), end: trim.end });
            }}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#7C3AED]"
            placeholder="MM:SS"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">End time</label>
          <input
            type="text"
            defaultValue={fmt(trim.end)}
            onBlur={e => {
              const v = parse(e.target.value);
              if (!isNaN(v)) onChange({ start: trim.start, end: Math.min(duration, Math.max(v, trim.start + 1)) });
            }}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#7C3AED]"
            placeholder="MM:SS"
          />
        </div>
      </div>

      <div className="text-xs text-gray-400 text-center">
        Duration: {fmt(trim.end - trim.start)}
      </div>

      <button
        onClick={() => onChange({ start: 0, end: duration })}
        className="w-full py-2 rounded-lg border border-white/10 text-sm text-gray-300 hover:bg-white/5 transition-colors"
      >
        Reset to full video
      </button>
    </div>
  );
}
