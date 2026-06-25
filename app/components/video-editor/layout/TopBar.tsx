"use client";

import Link from "next/link";
import { useEditorStore } from "../store/editorStore";
import { useEditorUIStore } from "../store/uiStore";
import { T } from "../editorTheme";

export default function TopBar() {
  const projectName = useEditorStore(s => s.projectName);
  const saveStatus = useEditorStore(s => s.saveStatus);
  const setProjectName = useEditorStore(s => s.setProjectName);
  const setExportModalOpen = useEditorStore(s => s.setExportModalOpen);
  const undo = useEditorStore(s => s.undo);
  const redo = useEditorStore(s => s.redo);
  const past = useEditorStore(s => s.past);
  const future = useEditorStore(s => s.future);
  const toggleCommandPalette = useEditorUIStore(s => s.toggleCommandPalette);
  const setShortcutsOpen = useEditorUIStore(s => s.setShortcutsOpen);

  const statusColor: Record<string, string> = {
    saved: T.green, saving: T.amber, unsaved: T.textFaint, error: T.red,
  };

  return (
    <div
      className="flex items-center justify-between px-3 flex-shrink-0"
      style={{ height: 52, background: T.glass, borderBottom: `1px solid ${T.border}`, backdropFilter: "blur(12px)" }}
    >
      {/* Left — brand + back + undo/redo */}
      <div className="flex items-center gap-2.5">
        <Link href="/dashboard" className="flex items-center gap-2 group">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: T.accent }}>
            <svg viewBox="0 0 24 24" fill="#fff" className="w-3.5 h-3.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke={T.textFaint} strokeWidth={2} className="w-4 h-4 transition-colors group-hover:stroke-white">
            <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>

        <div className="w-px h-5" style={{ background: T.border }} />

        <div className="flex items-center gap-0.5">
          <IconBtn onClick={undo} disabled={past.length === 0} title="Undo (⌘Z)">
            <path d="M3 10h10a5 5 0 010 10H9M3 10l4-4M3 10l4 4" strokeLinecap="round" strokeLinejoin="round" />
          </IconBtn>
          <IconBtn onClick={redo} disabled={future.length === 0} title="Redo (⌘⇧Z)">
            <path d="M21 10H11a5 5 0 000 10h4M21 10l-4-4M21 10l-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </IconBtn>
        </div>
      </div>

      {/* Center — project name + save status */}
      <div className="flex items-center gap-2">
        <input
          className="text-sm font-semibold bg-transparent border-none outline-none text-center rounded-md px-2 py-1 transition-colors"
          style={{ color: T.text, width: 240 }}
          value={projectName}
          onChange={e => setProjectName(e.target.value)}
          onFocus={e => (e.currentTarget.style.background = T.surface2)}
          onBlur={e => (e.currentTarget.style.background = "transparent")}
        />
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor[saveStatus], boxShadow: `0 0 8px ${statusColor[saveStatus]}` }} />
          <span className="text-xs" style={{ color: T.textFaint }}>
            {saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Save failed" : "Unsaved"}
          </span>
        </div>
      </div>

      {/* Right — palette, help, export */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={toggleCommandPalette}
          title="Command palette (⌘K)"
          className="flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-lg text-xs transition-colors"
          style={{ color: T.textMuted, background: T.surface2, border: `1px solid ${T.border}` }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" strokeLinecap="round" /></svg>
          <kbd className="text-[10px] px-1 py-0.5 rounded" style={{ background: T.surface3, color: T.textFaint }}>⌘K</kbd>
        </button>
        <IconBtn onClick={() => setShortcutsOpen(true)} title="Keyboard shortcuts (?)">
          <circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 115 0c0 1.5-2.5 2-2.5 3.5M12 17h.01" strokeLinecap="round" strokeLinejoin="round" />
        </IconBtn>
        <button
          onClick={() => setExportModalOpen(true)}
          className="flex items-center gap-2 px-4 h-8 rounded-lg text-sm font-semibold transition-all ml-1"
          style={{ background: `linear-gradient(135deg, ${T.accent}, #5B7CFF)`, color: "#fff", boxShadow: "0 2px 12px rgba(51,92,255,0.35)" }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.filter = "brightness(1.08)")}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.filter = "none")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Export
        </button>
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-8 h-8 flex items-center justify-center rounded-md transition-colors"
      style={{ color: disabled ? T.textFaint : T.textMuted, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}
      onMouseEnter={e => { if (!disabled) { (e.currentTarget as HTMLElement).style.background = T.surface3; (e.currentTarget as HTMLElement).style.color = T.text; } }}
      onMouseLeave={e => { if (!disabled) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = T.textMuted; } }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">{children}</svg>
    </button>
  );
}
