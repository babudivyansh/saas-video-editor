"use client";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface Props {
  speed: number;
  onChange: (s: number) => void;
}

export default function SpeedPanel({ speed, onChange }: Props) {
  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-bold text-white">Playback Speed</h3>

      <div className="grid grid-cols-3 gap-2">
        {SPEEDS.map(s => (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={`py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
              speed === s
                ? "bg-[#7C3AED] border-[#7C3AED] text-white"
                : "border-white/10 text-gray-300 hover:bg-white/5"
            }`}
          >
            {s}×
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-500 text-center">
        Applied to playback preview and client-side export.
      </p>
    </div>
  );
}
