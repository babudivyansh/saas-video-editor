"use client";

import { useEditorStore } from "../store/editorStore";
import type { VideoClipData } from "@/lib/track-editor-types";

interface Props { clipId: string; data: VideoClipData }

export default function VideoClipProperties({ clipId, data }: Props) {
  const updateClipData = useEditorStore(s => s.updateClipData);
  const patch = (p: Partial<VideoClipData>) => updateClipData(clipId, p);

  return (
    <div className="flex flex-col gap-0">
      <Section label="Transform">
        <Row label="Pos X">
          <Slider value={data.posX} min={0} max={1} step={0.01} onChange={v => patch({ posX: v })} />
          <Val>{Math.round(data.posX * 100)}%</Val>
        </Row>
        <Row label="Pos Y">
          <Slider value={data.posY} min={0} max={1} step={0.01} onChange={v => patch({ posY: v })} />
          <Val>{Math.round(data.posY * 100)}%</Val>
        </Row>
        <Row label="Scale X">
          <Slider value={data.scaleX} min={0.1} max={3} step={0.01} onChange={v => patch({ scaleX: v })} />
          <Val>{data.scaleX.toFixed(2)}x</Val>
        </Row>
        <Row label="Scale Y">
          <Slider value={data.scaleY} min={0.1} max={3} step={0.01} onChange={v => patch({ scaleY: v })} />
          <Val>{data.scaleY.toFixed(2)}x</Val>
        </Row>
        <Row label="Rotation">
          <Slider value={data.rotation} min={-180} max={180} step={1} onChange={v => patch({ rotation: v })} />
          <Val>{data.rotation}°</Val>
        </Row>
      </Section>

      <Section label="Appearance">
        <Row label="Opacity">
          <Slider value={data.opacity} min={0} max={1} step={0.01} onChange={v => patch({ opacity: v })} />
          <Val>{Math.round(data.opacity * 100)}%</Val>
        </Row>
        <Row label="Blur">
          <Slider value={data.blur} min={0} max={20} step={0.5} onChange={v => patch({ blur: v })} />
          <Val>{data.blur}px</Val>
        </Row>
      </Section>

      <Section label="Color Grade">
        <Row label="Brightness">
          <Slider value={data.brightness} min={0} max={2} step={0.01} onChange={v => patch({ brightness: v })} />
          <Val>{data.brightness.toFixed(2)}</Val>
        </Row>
        <Row label="Contrast">
          <Slider value={data.contrast} min={0} max={2} step={0.01} onChange={v => patch({ contrast: v })} />
          <Val>{data.contrast.toFixed(2)}</Val>
        </Row>
        <Row label="Saturation">
          <Slider value={data.saturation} min={0} max={2} step={0.01} onChange={v => patch({ saturation: v })} />
          <Val>{data.saturation.toFixed(2)}</Val>
        </Row>
      </Section>

      <Section label="Playback">
        <Row label="Speed">
          <Slider value={data.speed} min={0.25} max={4} step={0.05} onChange={v => patch({ speed: v })} />
          <Val>{data.speed.toFixed(2)}x</Val>
        </Row>
      </Section>

      {/* Reset */}
      <div className="px-3 py-2">
        <button
          onClick={() => patch({ posX: 0.5, posY: 0.5, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, blur: 0, brightness: 1, contrast: 1, saturation: 1, speed: 1 })}
          className="w-full text-xs py-1.5 rounded-md transition-colors"
          style={{ background: "#1e1e22", color: "#71717a", border: "1px solid #27272a" }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#e4e4e7")}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#71717a")}
        >
          Reset All
        </button>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 py-1.5" style={{ borderBottom: "1px solid #1a1a1e" }}>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#52525b" }}>{label}</span>
      </div>
      <div className="px-3 py-1.5 flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs w-16 flex-shrink-0" style={{ color: "#71717a" }}>{label}</span>
      <div className="flex items-center gap-1.5 flex-1">{children}</div>
    </div>
  );
}

function Slider({ value, min, max, step, onChange }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={e => onChange(Number(e.target.value))}
      className="flex-1 accent-blue-500"
      style={{ height: 2 }}
    />
  );
}

function Val({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs w-10 text-right flex-shrink-0 tabular-nums" style={{ color: "#a1a1aa" }}>
      {children}
    </span>
  );
}
