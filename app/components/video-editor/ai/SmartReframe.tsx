"use client";

import { useState } from "react";
import { useEditorStore } from "../store/editorStore";
import { ASPECT_DIMENSIONS, ASPECT_LABELS, type TrackAspect } from "@/lib/track-editor-types";

const ASPECTS: TrackAspect[] = ["9:16", "16:9", "1:1", "4:5"];

// SVG preview shape for each ratio
function AspectPreview({ aspect }: { aspect: TrackAspect }) {
  const { w, h } = ASPECT_DIMENSIONS[aspect];
  const maxSide = 40;
  const sw = w >= h ? maxSide : Math.round(maxSide * w / h);
  const sh = h >= w ? maxSide : Math.round(maxSide * h / w);
  return (
    <svg viewBox={`0 0 ${maxSide + 4} ${maxSide + 4}`} width={maxSide + 4} height={maxSide + 4}>
      <rect
        x={(maxSide + 4 - sw) / 2}
        y={(maxSide + 4 - sh) / 2}
        width={sw}
        height={sh}
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

export default function SmartReframe() {
  const setSmartReframeOpen = useEditorStore(s => s.setSmartReframeOpen);
  const currentAspect = useEditorStore(s => s.present.aspect);
  const setAspect = useEditorStore(s => s.setAspect);

  const [selected, setSelected] = useState<TrackAspect>(currentAspect);
  const [applying, setApplying] = useState(false);

  function handleApply() {
    if (selected === currentAspect) {
      setSmartReframeOpen(false);
      return;
    }
    setApplying(true);
    // Small delay for visual feedback
    setTimeout(() => {
      setAspect(selected);
      setApplying(false);
      setSmartReframeOpen(false);
    }, 400);
  }

  const { w: cw, h: ch } = ASPECT_DIMENSIONS[currentAspect];
  const { w: tw, h: th } = ASPECT_DIMENSIONS[selected];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
    >
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{ width: 520, background: "#0d0d0f", border: "1px solid #27272a" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #1c1c1e" }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: "#e4e4e7" }}>Smart Reframe</h2>
            <p className="text-xs mt-0.5" style={{ color: "#52525b" }}>
              Convert your project to a different aspect ratio
            </p>
          </div>
          <button
            onClick={() => setSmartReframeOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ background: "#1a1a1e", color: "#71717a" }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-5">
          {/* Before / After preview */}
          <div className="flex items-center justify-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs font-semibold" style={{ color: "#52525b" }}>Current</p>
              <div
                className="flex items-center justify-center rounded-lg"
                style={{
                  width: cw >= ch ? 80 : Math.round(80 * cw / ch),
                  height: ch >= cw ? 80 : Math.round(80 * ch / cw),
                  background: "#1a1a1e",
                  border: "1px solid #3f3f46",
                }}
              >
                <span className="text-xs font-bold" style={{ color: "#71717a" }}>{currentAspect}</span>
              </div>
            </div>

            <svg viewBox="0 0 24 12" width={24} height={12}>
              <path d="M1 6h20M17 2l4 4-4 4" stroke="#3f3f46" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            </svg>

            <div className="flex flex-col items-center gap-2">
              <p className="text-xs font-semibold" style={{ color: "#52525b" }}>New</p>
              <div
                className="flex items-center justify-center rounded-lg transition-all"
                style={{
                  width: tw >= th ? 80 : Math.round(80 * tw / th),
                  height: th >= tw ? 80 : Math.round(80 * th / tw),
                  background: "#1e2a3a",
                  border: "1px solid #3b82f6",
                }}
              >
                <span className="text-xs font-bold" style={{ color: "#3b82f6" }}>{selected}</span>
              </div>
            </div>
          </div>

          {/* Aspect ratio grid */}
          <div className="grid grid-cols-4 gap-2">
            {ASPECTS.map(a => {
              const isActive = selected === a;
              const isCurrent = currentAspect === a;
              return (
                <button
                  key={a}
                  onClick={() => setSelected(a)}
                  className="flex flex-col items-center gap-2 py-3 px-2 rounded-xl transition-all"
                  style={{
                    background: isActive ? "#1e2a3a" : "#111113",
                    border: `1px solid ${isActive ? "#3b82f6" : "#27272a"}`,
                    color: isActive ? "#3b82f6" : "#71717a",
                  }}
                >
                  <AspectPreview aspect={a} />
                  <div>
                    <p className="text-xs font-bold leading-none">{a}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: isActive ? "#60a5fa" : "#52525b" }}>
                      {ASPECT_LABELS[a].split(" · ")[1]}
                    </p>
                  </div>
                  {isCurrent && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#27272a", color: "#52525b" }}>
                      current
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Info note */}
          <div className="rounded-lg px-3 py-2.5" style={{ background: "#111827", border: "1px solid #1e3a5f" }}>
            <p className="text-xs" style={{ color: "#60a5fa" }}>
              <strong>Center crop</strong> — All video clips will be reframed to fit the new canvas.
              Clip positions are preserved; use the Properties panel to fine-tune after applying.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => setSmartReframeOpen(false)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: "#1a1a1e", color: "#71717a", border: "1px solid #27272a" }}
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={applying}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: applying ? "#1e3a5f" : "linear-gradient(135deg,#3b82f6,#6366f1)",
                color: "#fff",
                opacity: applying ? 0.8 : 1,
              }}
            >
              {applying ? "Applying…" : selected === currentAspect ? "Close" : `Apply ${selected}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
