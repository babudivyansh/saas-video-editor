"use client";

import { useEditorStore } from "../store/editorStore";
import type { TextClipData, TextAnimation } from "@/lib/track-editor-types";

interface Props { clipId: string; data: TextClipData }

const FONTS = ["Arial, sans-serif", "Impact, sans-serif", "'Times New Roman', serif", "'Courier New', monospace", "Georgia, serif", "Verdana, sans-serif"];
const FONT_LABELS = ["Arial", "Impact", "Times New Roman", "Courier New", "Georgia", "Verdana"];
const ANIMATIONS: { id: TextAnimation; label: string }[] = [
  { id: "none", label: "None" },
  { id: "fade-in", label: "Fade In" },
  { id: "slide-up", label: "Slide Up" },
  { id: "slide-down", label: "Slide Down" },
  { id: "zoom-in", label: "Zoom In" },
  { id: "typewriter", label: "Typewriter" },
  { id: "bounce", label: "Bounce" },
];

export default function TextClipProperties({ clipId, data }: Props) {
  const updateClipData = useEditorStore(s => s.updateClipData);
  const patch = (p: Partial<TextClipData>) => updateClipData(clipId, p);

  return (
    <div className="flex flex-col gap-0 text-xs">
      {/* Text content */}
      <Section label="Text">
        <textarea
          value={data.text}
          onChange={e => patch({ text: e.target.value })}
          rows={3}
          className="w-full rounded-md px-2 py-1.5 outline-none resize-none text-xs"
          style={{ background: "#1e1e22", border: "1px solid #27272a", color: "#e4e4e7" }}
        />
      </Section>

      {/* Font */}
      <Section label="Font">
        <select
          value={data.fontFamily}
          onChange={e => patch({ fontFamily: e.target.value })}
          className="w-full rounded-md px-2 py-1 outline-none text-xs"
          style={{ background: "#1e1e22", border: "1px solid #27272a", color: "#e4e4e7" }}
        >
          {FONTS.map((f, i) => <option key={f} value={f}>{FONT_LABELS[i]}</option>)}
        </select>
        <Row label="Size">
          <input type="range" value={data.fontSize} min={12} max={300} step={1} onChange={e => patch({ fontSize: Number(e.target.value) })} className="flex-1 accent-blue-500" style={{ height: 2 }} />
          <span className="w-10 text-right tabular-nums" style={{ color: "#a1a1aa" }}>{data.fontSize}px</span>
        </Row>
        <div className="flex items-center gap-2">
          <ToggleBtn active={data.bold} onClick={() => patch({ bold: !data.bold })}>B</ToggleBtn>
          <ToggleBtn active={data.italic} onClick={() => patch({ italic: !data.italic })} italic>I</ToggleBtn>
          <ToggleBtn active={data.uppercase} onClick={() => patch({ uppercase: !data.uppercase })}>AA</ToggleBtn>
        </div>
      </Section>

      {/* Color */}
      <Section label="Color">
        <Row label="Text">
          <input type="color" value={data.color} onChange={e => patch({ color: e.target.value })} className="w-8 h-7 rounded cursor-pointer border-0" />
          <span style={{ color: "#a1a1aa" }}>{data.color}</span>
        </Row>
      </Section>

      {/* Position */}
      <Section label="Position">
        <Row label="X">
          <input type="range" value={data.posX} min={0} max={1} step={0.01} onChange={e => patch({ posX: Number(e.target.value) })} className="flex-1 accent-blue-500" style={{ height: 2 }} />
          <span className="w-10 text-right tabular-nums" style={{ color: "#a1a1aa" }}>{Math.round(data.posX * 100)}%</span>
        </Row>
        <Row label="Y">
          <input type="range" value={data.posY} min={0} max={1} step={0.01} onChange={e => patch({ posY: Number(e.target.value) })} className="flex-1 accent-blue-500" style={{ height: 2 }} />
          <span className="w-10 text-right tabular-nums" style={{ color: "#a1a1aa" }}>{Math.round(data.posY * 100)}%</span>
        </Row>
      </Section>

      {/* Animation */}
      <Section label="Animation">
        <select
          value={data.animation}
          onChange={e => patch({ animation: e.target.value as TextAnimation })}
          className="w-full rounded-md px-2 py-1 outline-none text-xs"
          style={{ background: "#1e1e22", border: "1px solid #27272a", color: "#e4e4e7" }}
        >
          {ANIMATIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </Section>

      {/* Stroke */}
      <Section label="Stroke">
        <div className="flex items-center justify-between mb-1">
          <span style={{ color: "#71717a" }}>Enable</span>
          <Toggle value={data.stroke} onChange={v => patch({ stroke: v })} />
        </div>
        {data.stroke && (
          <>
            <Row label="Color">
              <input type="color" value={data.strokeColor} onChange={e => patch({ strokeColor: e.target.value })} className="w-8 h-7 rounded cursor-pointer border-0" />
            </Row>
            <Row label="Width">
              <input type="range" value={data.strokeWidth} min={1} max={20} step={0.5} onChange={e => patch({ strokeWidth: Number(e.target.value) })} className="flex-1 accent-blue-500" style={{ height: 2 }} />
              <span className="w-10 text-right tabular-nums" style={{ color: "#a1a1aa" }}>{data.strokeWidth}px</span>
            </Row>
          </>
        )}
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 py-1.5" style={{ borderBottom: "1px solid #1a1a1e" }}>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#52525b" }}>{label}</span>
      </div>
      <div className="px-3 py-2 flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs w-12 flex-shrink-0" style={{ color: "#71717a" }}>{label}</span>
      <div className="flex items-center gap-1.5 flex-1">{children}</div>
    </div>
  );
}

function ToggleBtn({ active, onClick, children, italic }: { active: boolean; onClick: () => void; children: React.ReactNode; italic?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-8 h-7 rounded flex items-center justify-center text-xs font-bold transition-all"
      style={{
        background: active ? "#1e3a5f" : "#1e1e22",
        border: `1px solid ${active ? "#2563eb" : "#27272a"}`,
        color: active ? "#60a5fa" : "#71717a",
        fontStyle: italic ? "italic" : "normal",
      }}
    >
      {children}
    </button>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative w-9 h-5 rounded-full transition-all"
      style={{ background: value ? "#2563eb" : "#27272a" }}
    >
      <div className="absolute top-0.5 w-4 h-4 rounded-full transition-all" style={{ background: "white", left: value ? "calc(100% - 18px)" : 2 }} />
    </button>
  );
}
