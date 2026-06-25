"use client";

import { useEditorStore } from "../store/editorStore";
import type { VideoClipData, AnimatableParam } from "@/lib/track-editor-types";
import { upsertKeyframe, removeKeyframesFor, hasKeyframes } from "@/lib/keyframes";
import { T } from "../editorTheme";

interface Props { clipId: string; data: VideoClipData }

const ANIM_PARAMS: { key: AnimatableParam; label: string }[] = [
  { key: "posX", label: "X" }, { key: "posY", label: "Y" },
  { key: "scaleX", label: "Scale X" }, { key: "scaleY", label: "Scale Y" },
  { key: "rotation", label: "Rotate" }, { key: "opacity", label: "Opacity" },
];

export default function VideoClipProperties({ clipId, data }: Props) {
  const updateClipData = useEditorStore(s => s.updateClipData);
  const patch = (p: Partial<VideoClipData>) => updateClipData(clipId, p);

  // Add a keyframe for `param` at the playhead (local clip time), capturing the
  // current static value so animation reads naturally.
  function addKeyframe(param: AnimatableParam) {
    const s = useEditorStore.getState();
    const found = s.present.tracks.flatMap(t => t.clips).find(c => c.id === clipId);
    if (!found) return;
    const localT = Math.max(0, s.currentTime - found.start);
    const v = (data as unknown as Record<AnimatableParam, number>)[param];
    patch({ keyframes: upsertKeyframe(data.keyframes, param, localT, v) });
  }
  const clearKeyframe = (param: AnimatableParam) => patch({ keyframes: removeKeyframesFor(data.keyframes, param) });

  const chroma = data.chroma ?? { enabled: false, color: "#00ff00", similarity: 0.3, blend: 0.1 };
  const mask = data.mask ?? { enabled: false, x: 0.25, y: 0.25, w: 0.5, h: 0.5, feather: 0.1, invert: false };

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

      {/* ── Keyframe animation ── */}
      <Section label={`Animation${hasKeyframes(data.keyframes) ? " ●" : ""}`}>
        <p className="text-[11px] mb-1" style={{ color: T.textFaint }}>Move the playhead, set a value, then ◆ to keyframe it.</p>
        <div className="grid grid-cols-2 gap-1.5">
          {ANIM_PARAMS.map(p => {
            const count = data.keyframes?.[p.key]?.length ?? 0;
            return (
              <div key={p.key} className="flex items-center gap-1">
                <button
                  onClick={() => addKeyframe(p.key)}
                  className="flex items-center gap-1 flex-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors"
                  style={{ background: count ? T.accentSoft : T.surface2, color: count ? T.accent : T.textMuted, border: `1px solid ${count ? T.accentRing : T.border}` }}
                  title={`Keyframe ${p.label} at playhead`}
                >
                  <span style={{ transform: "rotate(45deg)", display: "inline-block", width: 7, height: 7, background: "currentColor" }} />
                  {p.label}{count ? ` (${count})` : ""}
                </button>
                {count > 0 && (
                  <button onClick={() => clearKeyframe(p.key)} title="Clear keyframes" className="px-1 text-[11px]" style={{ color: T.textFaint }}>✕</button>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── Chroma key + Mask ── */}
      <Section label="Chroma & Mask">
        <label className="flex items-center justify-between text-xs cursor-pointer" style={{ color: T.textMuted }}>
          Green screen (chroma key)
          <input type="checkbox" checked={chroma.enabled} onChange={e => patch({ chroma: { ...chroma, enabled: e.target.checked } })} className="accent-blue-500" />
        </label>
        {chroma.enabled && (
          <>
            <Row label="Key color">
              <input type="color" value={chroma.color} onChange={e => patch({ chroma: { ...chroma, color: e.target.value } })} className="w-8 h-6 rounded cursor-pointer bg-transparent" />
              <span className="text-xs flex-1" style={{ color: T.textFaint }}>{chroma.color}</span>
            </Row>
            <Row label="Similarity"><Slider value={chroma.similarity} min={0.01} max={1} step={0.01} onChange={v => patch({ chroma: { ...chroma, similarity: v } })} /><Val>{chroma.similarity.toFixed(2)}</Val></Row>
            <Row label="Blend"><Slider value={chroma.blend} min={0} max={1} step={0.01} onChange={v => patch({ chroma: { ...chroma, blend: v } })} /><Val>{chroma.blend.toFixed(2)}</Val></Row>
          </>
        )}
        <label className="flex items-center justify-between text-xs cursor-pointer mt-1" style={{ color: T.textMuted }}>
          Rectangle mask
          <input type="checkbox" checked={mask.enabled} onChange={e => patch({ mask: { ...mask, enabled: e.target.checked } })} className="accent-blue-500" />
        </label>
        {mask.enabled && (
          <>
            <Row label="X"><Slider value={mask.x} min={0} max={1} step={0.01} onChange={v => patch({ mask: { ...mask, x: v } })} /><Val>{Math.round(mask.x * 100)}%</Val></Row>
            <Row label="Y"><Slider value={mask.y} min={0} max={1} step={0.01} onChange={v => patch({ mask: { ...mask, y: v } })} /><Val>{Math.round(mask.y * 100)}%</Val></Row>
            <Row label="Width"><Slider value={mask.w} min={0.05} max={1} step={0.01} onChange={v => patch({ mask: { ...mask, w: v } })} /><Val>{Math.round(mask.w * 100)}%</Val></Row>
            <Row label="Height"><Slider value={mask.h} min={0.05} max={1} step={0.01} onChange={v => patch({ mask: { ...mask, h: v } })} /><Val>{Math.round(mask.h * 100)}%</Val></Row>
            <label className="flex items-center justify-between text-xs cursor-pointer" style={{ color: T.textMuted }}>
              Invert mask
              <input type="checkbox" checked={mask.invert} onChange={e => patch({ mask: { ...mask, invert: e.target.checked } })} className="accent-blue-500" />
            </label>
          </>
        )}
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
