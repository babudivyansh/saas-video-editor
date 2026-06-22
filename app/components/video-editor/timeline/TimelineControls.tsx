"use client";

import { useEditorStore } from "../store/editorStore";

export default function TimelineControls() {
  const zoom = useEditorStore(s => s.zoom);
  const setZoom = useEditorStore(s => s.setZoom);
  const snapEnabled = useEditorStore(s => s.snapEnabled);
  const setSnapEnabled = useEditorStore(s => s.setSnapEnabled);
  const selectedClipId = useEditorStore(s => s.selectedClipId);
  const removeClip = useEditorStore(s => s.removeClip);
  const splitClipAtTime = useEditorStore(s => s.splitClipAtTime);
  const duplicateClip = useEditorStore(s => s.duplicateClip);
  const currentTime = useEditorStore(s => s.currentTime);
  const addMarker = useEditorStore(s => s.addMarker);
  const setCurrentTime = useEditorStore(s => s.setCurrentTime);
  const duration = useEditorStore(s => s.duration);

  return (
    <div
      className="flex items-center gap-1 px-3 flex-shrink-0"
      style={{ height: 36, borderBottom: "1px solid #1a1a1e", background: "#111113" }}
    >
      {/* Clip actions */}
      <div className="flex items-center gap-1">
        <CtrlBtn
          title="Split at playhead (S)"
          disabled={!selectedClipId}
          onClick={() => selectedClipId && splitClipAtTime(selectedClipId, currentTime)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
            <line x1="12" y1="2" x2="12" y2="22" strokeLinecap="round" />
            <path d="M5 9l-3 3 3 3M19 9l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Split
        </CtrlBtn>
        <CtrlBtn
          title="Duplicate clip (Ctrl+D)"
          disabled={!selectedClipId}
          onClick={() => selectedClipId && duplicateClip(selectedClipId)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          Dupe
        </CtrlBtn>
        <CtrlBtn
          title="Delete clip (Delete)"
          disabled={!selectedClipId}
          onClick={() => selectedClipId && removeClip(selectedClipId)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
            <polyline points="3 6 5 6 21 6" strokeLinecap="round" />
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
          </svg>
          Delete
        </CtrlBtn>
      </div>

      <div className="w-px h-4 mx-1" style={{ background: "#27272a" }} />

      {/* Marker */}
      <CtrlBtn title="Add marker (M)" onClick={() => addMarker(currentTime)}>
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M21 3H3v10l9 9 9-9V3z" opacity={0.8} />
        </svg>
        Marker
      </CtrlBtn>

      <div className="flex-1" />

      {/* Snap toggle */}
      <button
        onClick={() => setSnapEnabled(!snapEnabled)}
        className="flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors"
        style={{
          background: snapEnabled ? "#1e3a5f" : "transparent",
          color: snapEnabled ? "#60a5fa" : "#52525b",
          border: `1px solid ${snapEnabled ? "#1d4ed8" : "transparent"}`,
        }}
        title="Toggle snap"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
          <path d="M21 12H3M12 3v18" strokeLinecap="round" />
        </svg>
        Snap
      </button>

      {/* Zoom controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setZoom(zoom / 1.5)}
          className="w-6 h-6 flex items-center justify-center rounded transition-colors text-sm"
          style={{ color: "#52525b" }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#e4e4e7")}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#52525b")}
          title="Zoom out (-)"
        >
          −
        </button>
        <input
          type="range"
          min={20}
          max={400}
          value={zoom}
          onChange={e => setZoom(Number(e.target.value))}
          className="w-20 accent-blue-500"
          style={{ height: 2 }}
        />
        <button
          onClick={() => setZoom(zoom * 1.5)}
          className="w-6 h-6 flex items-center justify-center rounded transition-colors text-sm"
          style={{ color: "#52525b" }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#e4e4e7")}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#52525b")}
          title="Zoom in (+)"
        >
          +
        </button>
      </div>
    </div>
  );
}

function CtrlBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors"
      style={{
        color: disabled ? "#3f3f46" : "#71717a",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.color = "#e4e4e7"; }}
      onMouseLeave={e => { if (!disabled) (e.currentTarget as HTMLElement).style.color = "#71717a"; }}
    >
      {children}
    </button>
  );
}
