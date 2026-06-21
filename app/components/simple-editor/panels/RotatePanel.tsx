"use client";

const STEPS: (0 | 90 | 180 | 270)[] = [0, 90, 180, 270];

interface Props {
  rotation: 0 | 90 | 180 | 270;
  onChange: (r: 0 | 90 | 180 | 270) => void;
}

export default function RotatePanel({ rotation, onChange }: Props) {
  const rotateRight = () => {
    const next = ((rotation + 90) % 360) as 0 | 90 | 180 | 270;
    onChange(next);
  };

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-bold text-white">Rotate</h3>

      <div className="flex items-center justify-center">
        <div className="w-20 h-20 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center text-white text-2xl"
          style={{ transform: `rotate(${rotation}deg)`, transition: "transform 300ms ease" }}>
          ▶
        </div>
      </div>

      <p className="text-center text-sm text-white font-mono">{rotation}°</p>

      <button
        onClick={rotateRight}
        className="w-full py-2.5 rounded-lg bg-[#7C3AED] hover:bg-[#6d28d9] text-white text-sm font-semibold transition-colors"
        aria-label="Rotate 90° clockwise"
      >
        Rotate 90° clockwise
      </button>

      <div className="grid grid-cols-4 gap-1.5">
        {STEPS.map(s => (
          <button key={s} onClick={() => onChange(s)}
            className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${rotation === s ? "bg-[#7C3AED] border-[#7C3AED] text-white" : "border-white/10 text-gray-300 hover:bg-white/5"}`}>
            {s}°
          </button>
        ))}
      </div>
    </div>
  );
}
