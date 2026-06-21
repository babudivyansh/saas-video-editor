"use client";

import type { CropSettings } from "../types";

const PRESETS: { label: string; ratio: CropSettings["aspectRatio"]; w: number; h: number }[] = [
  { label: "16:9", ratio: "16:9", w: 100, h: 56.25 },
  { label: "9:16", ratio: "9:16", w: 56.25, h: 100 },
  { label: "1:1", ratio: "1:1", w: 75, h: 75 },
  { label: "4:5", ratio: "4:5", w: 75, h: 93.75 },
  { label: "Free", ratio: "free", w: 100, h: 100 },
];

interface Props {
  crop: CropSettings | null;
  onChange: (crop: CropSettings | null) => void;
}

export default function CropPanel({ crop, onChange }: Props) {
  const apply = (preset: typeof PRESETS[number]) => {
    // Center the crop box
    const x = (100 - preset.w) / 2;
    const y = (100 - preset.h) / 2;
    onChange({ x, y, width: preset.w, height: preset.h, aspectRatio: preset.ratio });
  };

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-bold text-white">Crop</h3>

      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map(p => (
          <button
            key={p.ratio}
            onClick={() => apply(p)}
            className={`py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
              crop?.aspectRatio === p.ratio
                ? "bg-[#7C3AED] border-[#7C3AED] text-white"
                : "border-white/10 text-gray-300 hover:bg-white/5"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {crop && (
        <div className="space-y-2 text-xs text-gray-400">
          <div className="flex justify-between">
            <span>Position</span>
            <span>X: {crop.x.toFixed(0)}% Y: {crop.y.toFixed(0)}%</span>
          </div>
          <div className="flex justify-between">
            <span>Size</span>
            <span>{crop.width.toFixed(0)}% × {crop.height.toFixed(0)}%</span>
          </div>
        </div>
      )}

      {crop && (
        <button
          onClick={() => onChange(null)}
          className="w-full py-2 rounded-lg border border-white/10 text-sm text-gray-300 hover:bg-white/5 transition-colors"
        >
          Remove crop
        </button>
      )}
    </div>
  );
}
