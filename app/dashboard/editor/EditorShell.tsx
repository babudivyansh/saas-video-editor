"use client";

// Top-level editor chrome: header bar + [sidebar | preview | properties] grid
// with the timeline docked along the bottom. All panes read from the shared
// Zustand store; this component owns none of the document state itself.

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ChevronLeft, Command, Bell, Sparkles, User as UserIcon, LogOut } from "lucide-react";
import type { Aspect } from "@/lib/editor/types";
import { useAuth } from "@/app/components/AuthContext";
import { useEditorStore } from "./store/editorStore";
import { useAutosave } from "./hooks/useAutosave";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import SidebarTabs from "./components/SidebarTabs";
import PreviewStage from "./components/PreviewStage";
import PropertiesPanel from "./components/PropertiesPanel";
import Timeline from "./components/timeline/Timeline";
import ExportModal from "./components/ExportModal";
import { Button, IconButton } from "./components/ui";

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
    <div className="clipiro-editor flex h-screen flex-col overflow-hidden bg-editor-bg font-sans text-editor-text">
      {/* Top bar */}
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-editor-border bg-editor-glass px-5 backdrop-blur-editor-glass">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1 rounded-editor-sm px-1.5 py-1 text-sm font-semibold text-editor-text-muted transition-colors hover:bg-editor-card hover:text-editor-text"
          >
            <ChevronLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <span className="h-5 w-px bg-editor-border" />
          <ProjectTitle />
        </div>

        <div className="flex items-center gap-2.5">
          <span className="hidden items-center gap-1.5 rounded-editor-full bg-editor-card px-2.5 py-1 text-[11px] text-editor-text-muted sm:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${save.dot}`} />
            {save.text}
          </span>

          {/* Aspect picker */}
          <div className="flex items-center rounded-editor-md border border-editor-border bg-editor-panel p-0.5">
            {ASPECTS.map((a) => (
              <button
                key={a}
                onClick={() => setAspect(a)}
                className="relative rounded-editor-sm px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer"
              >
                {aspect === a && (
                  <motion.span
                    layoutId="aspect-active"
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-0 rounded-editor-sm bg-editor-card"
                  />
                )}
                <span className={`relative ${aspect === a ? "text-editor-text" : "text-editor-text-faint"}`}>{a}</span>
              </button>
            ))}
          </div>

          {/* Inert chrome — not wired up in this pass. */}
          {/* TODO(phase-2): wire ⌘K command palette */}
          <span className="hidden items-center gap-1 rounded-editor-md border border-editor-border px-2 py-1 text-[11px] font-medium text-editor-text-faint lg:flex">
            <Command className="h-3 w-3" />K
          </span>
          <IconButton icon={<Bell className="h-4 w-4" />} label="Notifications" size="sm" tooltipSide="bottom" />

          <Button variant="primary" rounded="rounded-editor-full" onClick={() => setExportOpen(true)} className="!px-5 hover:shadow-editor-glow">
            <Sparkles className="h-3.5 w-3.5" />
            Export
          </Button>

          <ProfileChip />
        </div>
      </header>

      {/* Main panes — sidebar spans the full remaining height, alongside
          both the preview row and the timeline row below it. */}
      <div className="flex min-h-0 flex-1">
        <SidebarTabs />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-editor-bg p-4">
              <PreviewStage />
            </main>
            <PropertiesPanel />
          </div>
          <Timeline />
        </div>
      </div>

      {exportOpen && <ExportModal />}

      {/* Mobile gate — the editor needs pointer + horizontal space */}
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-editor-bg p-8 text-center md:hidden">
        <div>
          <p className="text-lg font-bold text-editor-text">The editor needs a bigger screen</p>
          <p className="mt-2 text-sm text-editor-text-muted">Open Clipiro on a desktop or laptop to edit your videos.</p>
          <Link
            href="/dashboard"
            className="mt-5 inline-block rounded-editor-full px-5 py-2.5 text-sm font-bold text-white"
            style={{ backgroundImage: "linear-gradient(135deg, var(--editor-accent), var(--editor-accent-hover))" }}
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
      className="w-44 truncate rounded-editor-sm border border-transparent bg-transparent px-2 py-1 text-[13px] font-medium tracking-tight text-editor-text outline-none transition-colors hover:border-editor-border focus:border-editor-accent"
      aria-label="Project title"
    />
  );
}

/** Account avatar + dropdown — mirrors the pattern already used by the
 *  dashboard's own SidebarAccount.tsx (avatar button, click-outside-to-close
 *  ref, always-mounted panel that fades/scales), retheme'd with editor
 *  tokens rather than inventing a new dropdown mechanism. */
function ProfileChip() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!user) return null;
  const initial = (user.name?.[0] ?? user.email?.[0] ?? "?").toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        title="Account"
        className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-white select-none transition-opacity hover:opacity-90 cursor-pointer"
        style={{ backgroundImage: "linear-gradient(135deg, var(--editor-accent), var(--editor-accent-hover))" }}
      >
        {user.avatarUrl ? <Image src={user.avatarUrl} alt="" fill sizes="32px" className="object-cover" /> : initial}
      </button>

      <div
        className={`absolute top-full right-0 z-30 mt-2 w-56 origin-top-right overflow-hidden rounded-editor-lg border border-editor-border bg-editor-elevated shadow-editor-lg transition-all duration-150 ease-out ${
          open ? "visible translate-y-0 scale-100 opacity-100" : "invisible pointer-events-none -translate-y-1 scale-95 opacity-0"
        }`}
      >
        <div className="border-b border-editor-border px-3.5 py-3">
          <p className="truncate text-sm font-semibold text-editor-text">{user.name || "User"}</p>
          <p className="truncate text-xs text-editor-text-muted">{user.email}</p>
        </div>
        <div className="py-1">
          <Link
            href="/dashboard/settings/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3.5 py-2 text-xs text-editor-text-muted transition-colors hover:bg-editor-card hover:text-editor-text"
          >
            <UserIcon className="h-3.5 w-3.5" /> My Account
          </Link>
        </div>
        <div className="border-t border-editor-border py-1">
          <button
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs text-red-400 transition-colors hover:bg-red-500/10 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
