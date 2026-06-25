"use client";

import { useEditorStore } from "../store/editorStore";
import { T } from "../editorTheme";

// Contextual quick-actions floating above the preview. Appears only when a clip
// is selected so the most common edits are one click away (no panel hunting).
export default function FloatingToolbar() {
  const selectedClipId = useEditorStore(s => s.selectedClipId);
  const currentTime = useEditorStore(s => s.currentTime);
  const split = useEditorStore(s => s.splitClipAtTime);
  const duplicate = useEditorStore(s => s.duplicateClip);
  const remove = useEditorStore(s => s.removeClip);
  const ripple = useEditorStore(s => s.rippleDelete);
  const setCaptionStudioOpen = useEditorStore(s => s.setCaptionStudioOpen);

  if (!selectedClipId) return null;

  const actions: { label: string; icon: React.ReactNode; run: () => void; danger?: boolean }[] = [
    {
      label: "Split", run: () => split(selectedClipId, currentTime),
      icon: <path d="M12 3v18M5 8l-2 4 2 4M19 8l2 4-2 4" strokeLinecap="round" strokeLinejoin="round" />,
    },
    {
      label: "Duplicate", run: () => duplicate(selectedClipId),
      icon: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" strokeLinecap="round" /></>,
    },
    {
      label: "Captions", run: () => setCaptionStudioOpen(true),
      icon: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 13h4M7 16h7M14 13h3" strokeLinecap="round" /></>,
    },
    {
      label: "Ripple", run: () => ripple(selectedClipId),
      icon: <path d="M3 12h12M11 8l4 4-4 4M21 6v12" strokeLinecap="round" strokeLinejoin="round" />,
    },
    {
      label: "Delete", run: () => remove(selectedClipId), danger: true,
      icon: <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" strokeLinecap="round" strokeLinejoin="round" />,
    },
  ];

  return (
    <div
      className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 px-1.5 py-1.5 rounded-xl"
      style={{ background: T.glass, border: `1px solid ${T.borderStrong}`, boxShadow: T.shadow, backdropFilter: "blur(12px)" }}
    >
      {actions.map((a, i) => (
        <div key={a.label} className="flex items-center">
          {a.label === "Delete" && <div className="w-px h-5 mx-1" style={{ background: T.border }} />}
          <button
            onClick={a.run}
            title={a.label}
            className="group flex flex-col items-center justify-center gap-0.5 w-12 h-11 rounded-lg transition-colors"
            style={{ color: a.danger ? T.red : T.textMuted }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = a.danger ? "rgba(255,92,92,0.12)" : T.surface3; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-[18px] h-[18px]">{a.icon}</svg>
            <span className="text-[9px] font-medium">{a.label}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
