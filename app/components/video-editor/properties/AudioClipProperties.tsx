"use client";

import { useEditorStore } from "../store/editorStore";
import type { AudioClipData } from "@/lib/track-editor-types";

interface Props { clipId: string; data: AudioClipData }

export default function AudioClipProperties({ clipId, data }: Props) {
  const updateClipData = useEditorStore(s => s.updateClipData);
  const patch = (p: Partial<AudioClipData>) => updateClipData(clipId, p);

  return (
    <div className="flex flex-col px-3 py-3 gap-3">
      <PropSection label="Volume">
        <SliderRow label="Volume" value={data.volume} min={0} max={2} step={0.01} unit="x" onChange={v => patch({ volume: v })} />
      </PropSection>
      <PropSection label="Fade">
        <SliderRow label="Fade In" value={data.fadeIn} min={0} max={5} step={0.1} unit="s" onChange={v => patch({ fadeIn: v })} />
        <SliderRow label="Fade Out" value={data.fadeOut} min={0} max={5} step={0.1} unit="s" onChange={v => patch({ fadeOut: v })} />
      </PropSection>
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: "#5a6170" }}>Mute</span>
        <Toggle value={data.muted} onChange={v => patch({ muted: v })} />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs block" style={{ color: "#5a6170" }}>Auto-duck under voice</span>
          <span className="text-[10px]" style={{ color: "#98a0ae" }}>Lowers this music when someone speaks</span>
        </div>
        <Toggle value={!!data.duck} onChange={v => patch({ duck: v })} />
      </div>
    </div>
  );
}

function PropSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: "#98a0ae" }}>{label}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs w-14 flex-shrink-0" style={{ color: "#5a6170" }}>{label}</span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={e => onChange(Number(e.target.value))} className="flex-1 accent-blue-500" style={{ height: 2 }} />
      <span className="text-xs w-10 text-right flex-shrink-0 tabular-nums" style={{ color: "#5a6170" }}>{value.toFixed(1)}{unit}</span>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative w-9 h-5 rounded-full transition-all"
      style={{ background: value ? "#335cff" : "#e4e7ec" }}
    >
      <div
        className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
        style={{ background: "white", left: value ? "calc(100% - 18px)" : 2 }}
      />
    </button>
  );
}
