"use client";

import { CAPTION_STYLES } from "@/lib/caption-styles";

export default function SubtitleStylePicker({
  value,
  onChange,
  sample = "VIRAL",
}: {
  value: number;
  onChange: (index: number) => void;
  sample?: string;
}) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
      {CAPTION_STYLES.map((s, i) => {
        const selected = i === value;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            title={s.label}
            className={`relative h-[72px] rounded-xl flex items-center justify-center overflow-hidden transition-all
              ${selected ? "ring-2 ring-blue-600 ring-offset-1" : "ring-1 ring-gray-200 hover:ring-gray-300"}`}
            style={{ background: "linear-gradient(135deg,#1e293b,#0f172a)" }}
          >
            <span
              style={{
                fontFamily: s.fontFamily,
                color: s.highlight,
                fontWeight: s.weight,
                fontStyle: s.italic ? "italic" : "normal",
                textTransform: s.uppercase ? "uppercase" : "none",
                textShadow: "0 1px 3px rgba(0,0,0,0.9), 0 0 2px #000",
                fontSize: 16,
                letterSpacing: 0.3,
              }}
            >
              {s.uppercase ? sample.toUpperCase() : sample}
            </span>
            {selected && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center">
                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
