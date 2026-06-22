"use client";

import Link from "next/link";
import { useEditorStore } from "../store/editorStore";

export default function TopBar() {
  const projectName = useEditorStore(s => s.projectName);
  const saveStatus = useEditorStore(s => s.saveStatus);
  const setProjectName = useEditorStore(s => s.setProjectName);
  const setExportModalOpen = useEditorStore(s => s.setExportModalOpen);
  const undo = useEditorStore(s => s.undo);
  const redo = useEditorStore(s => s.redo);
  const past = useEditorStore(s => s.past);
  const future = useEditorStore(s => s.future);

  const statusColor: Record<string, string> = {
    saved: "#4ade80",
    saving: "#facc15",
    unsaved: "#94a3b8",
    error: "#f87171",
  };

  return (
    <div
      className="flex items-center justify-between px-4 flex-shrink-0"
      style={{
        height: 48,
        background: "#18181b",
        borderBottom: "1px solid #27272a",
      }}
    >
      {/* Left — back + undo/redo */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-xs font-medium transition-colors"
          style={{ color: "#71717a" }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#e4e4e7")}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#71717a")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Dashboard
        </Link>

        <div className="w-px h-4" style={{ background: "#27272a" }} />

        <div className="flex items-center gap-1">
          <TopBarBtn onClick={undo} disabled={past.length === 0} title="Undo (Ctrl+Z)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M3 10h10a5 5 0 010 10H9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 10l4-4M3 10l4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </TopBarBtn>
          <TopBarBtn onClick={redo} disabled={future.length === 0} title="Redo (Ctrl+Shift+Z)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M21 10H11a5 5 0 000 10h4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 10l-4-4M21 10l-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </TopBarBtn>
        </div>
      </div>

      {/* Center — project name + save status */}
      <div className="flex items-center gap-2">
        <input
          className="text-sm font-semibold bg-transparent border-none outline-none text-center"
          style={{ color: "#e4e4e7", width: 220 }}
          value={projectName}
          onChange={e => setProjectName(e.target.value)}
        />
        <div className="flex items-center gap-1">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: statusColor[saveStatus] }}
          />
          <span className="text-xs" style={{ color: "#52525b" }}>
            {saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Save failed" : "Unsaved"}
          </span>
        </div>
      </div>

      {/* Right — export */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setExportModalOpen(true)}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
          style={{ background: "#2563eb", color: "#fff" }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#1d4ed8")}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "#2563eb")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" />
          </svg>
          Export
        </button>
      </div>
    </div>
  );
}

function TopBarBtn({
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
      className="w-8 h-8 flex items-center justify-center rounded-md transition-colors"
      style={{
        color: disabled ? "#3f3f46" : "#a1a1aa",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={e => {
        if (!disabled) (e.currentTarget as HTMLElement).style.color = "#e4e4e7";
      }}
      onMouseLeave={e => {
        if (!disabled) (e.currentTarget as HTMLElement).style.color = "#a1a1aa";
      }}
    >
      {children}
    </button>
  );
}
