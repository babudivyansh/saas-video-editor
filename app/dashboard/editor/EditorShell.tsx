"use client";

// Top-level editor chrome: header bar + [sidebar | preview | properties] grid
// with the timeline docked along the bottom. All panes read from the shared
// Zustand store; this component owns none of the document state itself.

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { ChevronLeft, Sparkles, User as UserIcon, LogOut, Undo2, Redo2, Search } from "lucide-react";
import type { Aspect } from "@/lib/editor/types";
import { useAuth } from "@/app/components/AuthContext";
import { useModKey } from "./hooks/useModKey";
import { useEditorStore } from "./store/editorStore";
import { useAutosave, reloadLatestProject } from "./hooks/useAutosave";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import SidebarTabs from "./components/SidebarTabs";
import PreviewStage from "./components/PreviewStage";
import EmptyProjectStart from "./components/EmptyProjectStart";
import PropertiesPanel from "./components/PropertiesPanel";
import Timeline from "./components/timeline/Timeline";
// Conditionally rendered ({exportOpen && ...} below), but a static import
// still bundles it into the initial editor chunk regardless — React just
// doesn't mount it early. Dynamic import defers the actual code fetch too.
const ExportModal = dynamic(() => import("./components/ExportModal"), { ssr: false });
const CommandPalette = dynamic(() => import("./components/CommandPalette"), { ssr: false });
const ShortcutsSheet = dynamic(() => import("./components/ShortcutsSheet"), { ssr: false });
const SilenceDialog = dynamic(() => import("./components/SilenceDialog"), { ssr: false });
import { ExportSplitButton, TitleMenu } from "./components/header/HeaderMenus";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";

const ASPECTS: Aspect[] = ["9:16", "1:1", "16:9"];

const SAVE_LABEL: Record<string, { text: string; dot: string }> = {
  saved: { text: "Saved", dot: "bg-emerald-500" },
  dirty: { text: "Unsaved changes", dot: "bg-amber-400" },
  saving: { text: "Saving…", dot: "bg-amber-400 animate-pulse" },
  error: { text: "Save failed", dot: "bg-red-500" },
  conflict: { text: "Saved elsewhere", dot: "bg-red-500" },
};

export default function EditorShell() {
  const aspect = useEditorStore((s) => s.doc.aspect);
  const docIsEmpty = useEditorStore((s) => Object.values(s.doc.tracks).every((t) => t.length === 0));
  const setAspect = useEditorStore((s) => s.setAspect);
  const saveState = useEditorStore((s) => s.saveState);
  const projectId = useEditorStore((s) => s.projectId);
  const exportOpen = useEditorStore((s) => s.exportOpen);
  const undoAction = useEditorStore((s) => s.undoAction);
  const redoAction = useEditorStore((s) => s.redoAction);
  const setPaletteOpen = useEditorStore((s) => s.setPaletteOpen);
  const { user } = useAuth();
  const modKey = useModKey();
  const [reloading, setReloading] = useState(false);
  // Replaces window.confirm / window.alert, which blocked the tab and looked
  // like a browser warning rather than part of the product.
  const [confirmReload, setConfirmReload] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);

  useAutosave();
  useKeyboardShortcuts();

  const save = SAVE_LABEL[saveState];

  // The only path that ever discards local edits — only reachable from the
  // conflict banner, only on explicit click (and a confirm), never automatic.
  const handleReloadLatest = async () => {
    if (!projectId || reloading) return;
    setReloadError(null);
    setReloading(true);
    const result = await reloadLatestProject(projectId);
    setReloading(false);
    if (!result.ok) setReloadError(result.error ?? "Could not load the latest version.");
  };

  return (
    <div className="clipiro-editor flex h-[100dvh] flex-col overflow-hidden bg-editor-bg font-sans text-editor-text">
      {/* Top bar — the "command header" from the 2026-10 redesign (A):
          project + title menu on the left, undo/redo and the command bar in
          the middle, shape, credits and Export on the right. */}
      <header className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-editor-border bg-editor-glass px-3 backdrop-blur-editor-glass">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link
            href="/dashboard"
            aria-label="Back to dashboard"
            className="flex h-9 items-center gap-1 rounded-editor-sm px-1.5 text-editor-text-muted transition-colors hover:bg-editor-card hover:text-editor-text"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="flex h-7 w-7 items-center justify-center rounded-editor-sm bg-[var(--primary)] text-[13px] font-extrabold text-editor-bg">C</span>
          </Link>
          <Link href="/dashboard/projects" className="hidden text-[13px] text-editor-text-faint transition-colors hover:text-editor-text md:inline">Projects</Link>
          <span className="hidden text-editor-text-faint md:inline">/</span>
          <ProjectTitle />
          <span className="ml-1 hidden items-center gap-1.5 whitespace-nowrap text-[11.5px] text-editor-text-muted sm:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${save.dot}`} />
            {save.text}
          </span>
          {saveState === "conflict" && (
            <button
              type="button"
              onClick={() => setConfirmReload(true)}
              disabled={reloading}
              className="ml-1 whitespace-nowrap rounded-editor-full border border-red-500/40 px-2.5 py-1 text-[11px] font-semibold text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50 cursor-pointer"
              title="Someone (or another tab) saved this project after your last edit here. Your changes below are safe but not saved yet."
            >
              {reloading ? "Loading…" : "Reload latest"}
            </button>
          )}
          {reloadError && <span role="alert" className="text-[11px] font-semibold text-red-400">{reloadError}</span>}
        </div>

        <div className="flex items-center gap-0.5">
          <button type="button" onClick={undoAction} aria-label="Undo" title="Undo (Ctrl+Z)" className="flex h-9 w-9 items-center justify-center rounded-editor-md text-editor-text-muted transition-colors hover:bg-editor-card hover:text-editor-text"><Undo2 className="h-4 w-4" /></button>
          <button type="button" onClick={redoAction} aria-label="Redo" title="Redo (Ctrl+Y)" className="flex h-9 w-9 items-center justify-center rounded-editor-md text-editor-text-muted transition-colors hover:bg-editor-card hover:text-editor-text"><Redo2 className="h-4 w-4" /></button>
        </div>

        <div className="flex flex-1 justify-center">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden h-9 w-full max-w-[300px] items-center gap-2 rounded-editor-md border border-editor-border bg-editor-panel px-3 text-[13px] text-editor-text-faint transition-colors hover:border-editor-border-strong hover:text-editor-text-muted lg:flex"
          >
            <Sparkles className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
            Search or run a command…
            <kbd className="ml-auto rounded-editor-sm border border-editor-border-strong px-1.5 py-0.5 text-[11px] text-editor-text-muted">{modKey} K</kbd>
          </button>
          <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Command bar" className="flex h-9 w-9 items-center justify-center rounded-editor-md text-editor-text-muted hover:bg-editor-card hover:text-editor-text lg:hidden">
            <Search className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Aspect picker */}
          <div role="group" aria-label="Aspect ratio" className="flex items-center rounded-editor-md border border-editor-border bg-editor-panel p-0.5">
            {ASPECTS.map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={aspect === a}
                onClick={() => setAspect(a)}
                className="relative rounded-editor-sm px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-editor-accent"
              >
                {aspect === a && (
                  <motion.span
                    layoutId="aspect-active"
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-0 rounded-editor-sm bg-editor-card"
                  />
                )}
                <span className={`relative ${aspect === a ? "text-editor-text" : "text-editor-text-muted"}`}>{a}</span>
              </button>
            ))}
          </div>

          {user && (
            <span className="hidden whitespace-nowrap rounded-editor-full border border-editor-border bg-editor-panel px-3 py-1.5 text-[12px] text-editor-text-muted xl:inline">
              <b className="font-semibold text-editor-text">{(user.minutes ?? 0).toLocaleString()}</b> min
              <span className="mx-1.5 text-editor-text-faint">|</span>
              <b className="font-semibold text-editor-text">{(user.credits ?? 0).toLocaleString()}</b> credits
            </span>
          )}

          <ExportSplitButton title="captions" />

          <ProfileChip />
        </div>
      </header>

      <ConfirmDialog
        open={confirmReload}
        title="Load the other version?"
        message="This loads the version saved from another tab or device. Your unsaved changes here will be lost."
        confirmLabel="Load it"
        danger
        onConfirm={handleReloadLatest}
        onClose={() => setConfirmReload(false)}
      />

      {/* Main panes — sidebar spans the full remaining height, alongside
          both the preview row and the timeline row below it. */}
      <div className="flex min-h-0 flex-1">
        <SidebarTabs />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-editor-bg p-4">
              {docIsEmpty ? <EmptyProjectStart /> : <PreviewStage />}
            </main>
            <PropertiesPanel />
          </div>
          <Timeline />
        </div>
      </div>

      {exportOpen && <ExportModal />}
      <CommandPalette />
      <ShortcutsSheet />
      <SilenceDialog />
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
    <span className="flex min-w-0 items-center">
    <input
      id="editor-project-title"
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="w-44 truncate rounded-editor-sm border border-transparent bg-transparent px-2 py-1 text-[13px] font-medium tracking-tight text-editor-text outline-none transition-colors hover:border-editor-border focus:border-editor-accent"
      aria-label="Project title"
    />
    <TitleMenu titleInputId="editor-project-title" title={title} />
    </span>
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
