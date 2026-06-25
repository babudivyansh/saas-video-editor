"use client";

import { useEditorUIStore } from "../store/uiStore";
import { T } from "../editorTheme";

const GROUPS: { title: string; rows: [string, string][] }[] = [
  { title: "Editing", rows: [["Split clip at playhead", "S"], ["Duplicate clip", "⌘D"], ["Delete clip", "Del"], ["Copy / Paste clip", "⌘C / ⌘V"], ["Add marker", "M"], ["Undo / Redo", "⌘Z / ⌘⇧Z"]] },
  { title: "Playback", rows: [["Play / Pause", "Space"], ["Nudge 1 frame", "← / →"]] },
  { title: "Timeline", rows: [["Zoom in / out", "+ / −"], ["Deselect", "Esc"]] },
  { title: "General", rows: [["Command palette", "⌘K"], ["This help", "?"], ["Export", "⌘E"]] },
];

export default function ShortcutsModal() {
  const open = useEditorUIStore(s => s.shortcutsOpen);
  const setOpen = useEditorUIStore(s => s.setShortcutsOpen);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" onMouseDown={() => setOpen(false)}>
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)" }} />
      <div
        className="relative w-full max-w-2xl rounded-2xl overflow-hidden"
        style={{ background: T.surface, border: `1px solid ${T.borderStrong}`, boxShadow: T.shadow }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5" style={{ height: 52, borderBottom: `1px solid ${T.border}` }}>
          <h2 className="text-sm font-bold" style={{ color: T.text }}>Keyboard shortcuts</h2>
          <button onClick={() => setOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-md" style={{ color: T.textMuted }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6 p-6">
          {GROUPS.map(g => (
            <div key={g.title}>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: T.accent }}>{g.title}</p>
              <div className="space-y-1.5">
                {g.rows.map(([label, key]) => (
                  <div key={label} className="flex items-center justify-between gap-3">
                    <span className="text-sm" style={{ color: T.textMuted }}>{label}</span>
                    <kbd className="text-[11px] px-2 py-0.5 rounded font-semibold flex-shrink-0" style={{ background: T.surface3, color: T.text, border: `1px solid ${T.border}` }}>{key}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
