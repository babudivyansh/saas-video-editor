"use client";

import { useEditorStore } from "../store/editorStore";
import { ASPECT_LABELS, type TrackAspect } from "@/lib/track-editor-types";

const ASPECTS: TrackAspect[] = ["9:16", "16:9", "1:1", "4:5"];

export default function AspectRatioPicker() {
  const aspect = useEditorStore(s => s.present.aspect);
  const setAspect = useEditorStore(s => s.setAspect);

  return (
    <div className="flex items-center gap-1">
      {ASPECTS.map(a => (
        <button
          key={a}
          onClick={() => setAspect(a)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all"
          style={{
            background: aspect === a ? "#1e3a5f" : "transparent",
            color: aspect === a ? "#60a5fa" : "#52525b",
            border: aspect === a ? "1px solid #1d4ed8" : "1px solid transparent",
          }}
          onMouseEnter={e => {
            if (aspect !== a) (e.currentTarget as HTMLElement).style.color = "#a1a1aa";
          }}
          onMouseLeave={e => {
            if (aspect !== a) (e.currentTarget as HTMLElement).style.color = "#52525b";
          }}
        >
          <AspectIcon ratio={a} active={aspect === a} />
          {ASPECT_LABELS[a]}
        </button>
      ))}
    </div>
  );
}

function AspectIcon({ ratio, active }: { ratio: TrackAspect; active: boolean }) {
  const color = active ? "#60a5fa" : "#52525b";
  const icons: Record<TrackAspect, React.ReactNode> = {
    "9:16": (
      <svg viewBox="0 0 12 18" className="w-2.5 h-3.5">
        <rect x="1" y="1" width="10" height="16" rx="1" fill="none" stroke={color} strokeWidth={1.5} />
      </svg>
    ),
    "16:9": (
      <svg viewBox="0 0 18 12" className="w-3.5 h-2.5">
        <rect x="1" y="1" width="16" height="10" rx="1" fill="none" stroke={color} strokeWidth={1.5} />
      </svg>
    ),
    "1:1": (
      <svg viewBox="0 0 14 14" className="w-3 h-3">
        <rect x="1" y="1" width="12" height="12" rx="1" fill="none" stroke={color} strokeWidth={1.5} />
      </svg>
    ),
    "4:5": (
      <svg viewBox="0 0 12 15" className="w-2.5 h-3">
        <rect x="1" y="1" width="10" height="13" rx="1" fill="none" stroke={color} strokeWidth={1.5} />
      </svg>
    ),
  };
  return icons[ratio];
}
