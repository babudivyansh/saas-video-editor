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
        style={{ width: 520, background: "#f3f4f7", border: "1px solid #e4e7ec" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #e4e7ec" }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: "#15181f" }}>Smart Reframe</h2>
            <p className="text-xs mt-0.5" style={{ color: "#98a0ae" }}>
              Convert your project to a different aspect ratio
            </p>
          </div>
          <button
            onClick={() => setSmartReframeOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ background: "#e4e7ec", color: "#5a6170" }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-5">
          {/* Before / After preview */}
          <div className="flex items-center justify-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs font-semibold" style={{ color: "#98a0ae" }}>Current</p>
              <div
                className="flex items-center justify-center rounded-lg"
                style={{
                  width: cw >= ch ? 80 : Math.round(80 * cw / ch),
                  height: ch >= cw ? 80 : Math.round(80 * ch / cw),
                  background: "#e4e7ec",
                  border: "1px solid #d3d8e0",
                }}
              >
                <span className="text-xs font-bold" style={{ color: "#5a6170" }}>{currentAspect}</span>
              </div>
            </div>

            <svg viewBox="0 0 24 12" width={24} height={12}>
              <path d="M1 6h20M17 2l4 4-4 4" stroke="#d3d8e0" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            </svg>

            <div className="flex flex-col items-center gap-2">
              <p className="text-xs font-semibold" style={{ color: "#98a0ae" }}>New</p>
              <div
                className="flex items-center justify-center rounded-lg transition-all"
                style={{
                  width: tw >= th ? 80 : Math.round(80 * tw / th),
                  height: th >= tw ? 80 : Math.round(80 * th / tw),
                  background: "#e8edff",
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
                    background: isActive ? "#e8edff" : "#f6f7f9",
                    border: `1px solid ${isActive ? "#3b82f6" : "#e4e7ec"}`,
                    color: isActive ? "#3b82f6" : "#5a6170",
                  }}
                >
                  <AspectPreview aspect={a} />
                  <div>
                    <p className="text-xs font-bold leading-none">{a}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: isActive ? "#335cff" : "#98a0ae" }}>
                      {ASPECT_LABELS[a].split(" · ")[1]}
                    </p>
                  </div>
                  {isCurrent && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#e4e7ec", color: "#98a0ae" }}>
                      current
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Info note */}
          <div className="rounded-lg px-3 py-2.5" style={{ background: "#eef1ff", border: "1px solid #e8edff" }}>
            <p className="text-xs" style={{ color: "#335cff" }}>
              <strong>Center crop</strong> — All video clips will be reframed to fit the new canvas.
              Clip positions are preserved; use the Properties panel to fine-tune after applying.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => setSmartReframeOpen(false)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: "#e4e7ec", color: "#5a6170", border: "1px solid #e4e7ec" }}
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={applying}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: applying ? "#e8edff" : "linear-gradient(135deg,#3b82f6,#335cff)",
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
