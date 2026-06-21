"use client";

interface Props {
  volume: number; // 0–2
  onChange: (v: number) => void;
}

export default function VolumePanel({ volume, onChange }: Props) {
  const muted = volume === 0;

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-bold text-white">Volume</h3>

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">Gain</span>
        <span className="text-sm font-mono text-white">{Math.round(volume * 100)}%</span>
      </div>

      <input
        type="range"
        min={0}
        max={2}
        step={0.01}
        value={volume}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-[#7C3AED]"
        aria-label="Volume"
      />

      <div className="flex justify-between text-xs text-gray-500">
        <span>0%</span>
        <span>100%</span>
        <span>200%</span>
      </div>

      <button
        onClick={() => onChange(muted ? 1 : 0)}
        className={`w-full py-2 rounded-lg border text-sm font-semibold transition-colors ${muted ? "border-[#7C3AED] bg-[#7C3AED]/20 text-[#7C3AED]" : "border-white/10 text-gray-300 hover:bg-white/5"}`}
      >
        {muted ? "Unmute" : "Mute"}
      </button>
    </div>
  );
}
