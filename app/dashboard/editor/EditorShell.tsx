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
    <div className="clipiro-editor flex h-screen flex-col overflow-hidden bg-zinc-950 font-sans text-zinc-100">
      {/* Top bar */}
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm font-semibold text-zinc-400 transition-colors hover:text-zinc-100"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Dashboard
          </Link>
          <span className="h-5 w-px bg-zinc-800" />
          <ProjectTitle />
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 text-xs text-zinc-500 sm:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${save.dot}`} />
            {save.text}
          </span>

          {/* Aspect picker */}
          <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-950 p-0.5">
            {ASPECTS.map((a) => (
              <button
                key={a}
                onClick={() => setAspect(a)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  aspect === a ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                {a}
              </button>
            ))}
          </div>

          <button
            onClick={() => setExportOpen(true)}
            className="rounded-full bg-violet-600 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-violet-500 cursor-pointer"
          >
            Export
          </button>
        </div>
      </header>

      {/* Main panes — sidebar spans the full remaining height, alongside
          both the preview row and the timeline row below it. */}
      <div className="flex min-h-0 flex-1">
        <SidebarTabs />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-zinc-950 p-4">
              <PreviewStage />
            </main>
            <PropertiesPanel />
          </div>
          <Timeline />
        </div>
      </div>

      {exportOpen && <ExportModal />}

      {/* Mobile gate — the editor needs pointer + horizontal space */}
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950 p-8 text-center md:hidden">
        <div>
          <p className="text-lg font-bold text-zinc-100">The editor needs a bigger screen</p>
          <p className="mt-2 text-sm text-zinc-400">Open Clipiro on a desktop or laptop to edit your videos.</p>
          <Link
            href="/dashboard"
            className="mt-5 inline-block rounded-full bg-violet-600 px-5 py-2.5 text-sm font-bold text-white"
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
      className="w-44 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-zinc-100 outline-none transition-colors hover:border-zinc-800 focus:border-violet-500"
      aria-label="Project title"
    />
  );
}
