"use client";

// Top-level editor chrome: header bar + [sidebar | preview | properties] grid
// with the timeline docked along the bottom. All panes read from the shared
// Zustand store; this component owns none of the document state itself.

import React from "react";
import Link from "next/link";
import type { Aspect } from "@/lib/editor/types";
import { useEditorStore } from "./store/editorStore";
import { useAutosave } from "./hooks/useAutosave";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import SidebarTabs from "./components/SidebarTabs";
import PreviewStage from "./components/PreviewStage";
import PropertiesPanel from "./components/PropertiesPanel";
import Timeline from "./components/timeline/Timeline";
import ExportModal from "./components/ExportModal";

const ASPECTS: Aspect[] = ["9:16", "1:1", "16:9"];

const SAVE_LABEL: Record<string, { text: string; dot: string }> = {
  saved: { text: "Saved", dot: "bg-emerald-500" },
  dirty: { text: "Unsaved changes", dot: "bg-amber-400" },
  saving: { text: "Saving…", dot: "bg-amber-400 animate-pulse" },
  error: { text: "Save failed", dot: "bg-red-500" },
};

export default function EditorShell() {
  const aspect = useEditorStore((s) => s.doc.aspect);
  const setAspect = useEditorStore((s) => s.setAspect);
  const saveState = useEditorStore((s) => s.saveState);
  const exportOpen = useEditorStore((s) => s.exportOpen);
  const setExportOpen = useEditorStore((s) => s.setExportOpen);

  useAutosave();
  useKeyboardShortcuts();

  const save = SAVE_LABEL[saveState];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface font-sans text-ink">
      {/* Top bar */}
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-card-border bg-white px-4">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft transition-colors hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Dashboard
          </Link>
          <span className="h-5 w-px bg-card-border" />
          <ProjectTitle />
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 text-xs text-ink-soft sm:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${save.dot}`} />
            {save.text}
          </span>

          {/* Aspect picker */}
          <div className="flex items-center rounded-lg border border-card-border bg-surface p-0.5">
            {ASPECTS.map((a) => (
              <button
                key={a}
                onClick={() => setAspect(a)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  aspect === a ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"
                }`}
              >
                {a}
              </button>
            ))}
          </div>

          <button
            onClick={() => setExportOpen(true)}
            className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-ink transition-colors hover:bg-brand-dark cursor-pointer"
          >
            Export
          </button>
        </div>
      </header>

      {/* Main panes */}
      <div className="flex min-h-0 flex-1">
        <SidebarTabs />
        <main className="flex min-w-0 flex-1 items-center justify-center p-4">
          <PreviewStage />
        </main>
        <PropertiesPanel />
      </div>

      {/* Timeline dock */}
      <Timeline />

      {exportOpen && <ExportModal />}

      {/* Mobile gate — the editor needs pointer + horizontal space */}
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-white p-8 text-center md:hidden">
        <div>
          <p className="text-lg font-bold text-ink">The editor needs a bigger screen</p>
          <p className="mt-2 text-sm text-ink-soft">Open Clipiro on a desktop or laptop to edit your videos.</p>
          <Link
            href="/dashboard"
            className="mt-5 inline-block rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-ink"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function ProjectTitle() {
  const projectId = useEditorStore((s) => s.projectId);
  const [title, setTitle] = React.useState("Untitled project");
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    if (!projectId || loaded) return;
    const token = localStorage.getItem("token");
    fetch(`/api/projects/${projectId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.project?.title) setTitle(d.project.title);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [projectId, loaded]);

  const commit = () => {
    if (!projectId) return;
    const token = localStorage.getItem("token");
    fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() || "Untitled project" }),
    }).catch(() => {});
  };

  return (
    <input
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="w-44 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-ink outline-none transition-colors hover:border-card-border focus:border-brand"
      aria-label="Project title"
    />
  );
}
