"use client";

// Header pieces for the editor's command header (redesign "A"): the project
// title menu and the Export split button.

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Copy, History, Keyboard, Pencil, Captions, Film, LayoutGrid } from "lucide-react";
import { Dropdown } from "@/app/components/ui/Dropdown";
import { useEditorStore } from "../../store/editorStore";
import { downloadCaptionsSrt } from "./downloadCaptions";

function MenuItem({ onClick, icon, children, hint, disabled }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode; hint?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-fg transition-colors hover:bg-surface-3 focus-visible:bg-surface-3 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="text-fg-muted">{icon}</span>
      <span className="flex-1">{children}</span>
      {hint && <span className="text-[11.5px] text-fg-subtle">{hint}</span>}
    </button>
  );
}

/** ▾ next to the title: rename, duplicate, shortcuts, all projects. */
export function TitleMenu({ titleInputId, title }: { titleInputId: string; title: string }) {
  const router = useRouter();
  const projectId = useEditorStore((s) => s.projectId);
  const setShortcutsOpen = useEditorStore((s) => s.setShortcutsOpen);
  const setHistoryOpen = useEditorStore((s) => s.setHistoryOpen);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function duplicate() {
    if (!projectId || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      const created = await fetch("/api/projects", {
        method: "POST",
        headers,
        body: JSON.stringify({ title: `${title || "Untitled project"} (copy)`.slice(0, 120), productType: "editor" }),
      });
      if (!created.ok) throw new Error("create");
      const { project } = (await created.json()) as { project: { id: string; editorVersion?: number } };
      const saved = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ editorDoc: useEditorStore.getState().doc, expectedVersion: project.editorVersion ?? 1 }),
      });
      if (!saved.ok) throw new Error("save");
      router.push(`/dashboard/editor?projectId=${project.id}`);
    } catch {
      setErr("Couldn't duplicate this project. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dropdown
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Project menu"
          className="flex h-7 w-7 items-center justify-center rounded-editor-sm text-editor-text-muted transition-colors hover:bg-editor-card hover:text-editor-text"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
      className="w-64"
    >
      {({ close }) => (
        <div className="py-1">
          <MenuItem icon={<Pencil className="h-4 w-4" />} onClick={() => { close(); document.getElementById(titleInputId)?.focus(); }}>Rename</MenuItem>
          <MenuItem icon={<Copy className="h-4 w-4" />} disabled={!projectId || busy} onClick={() => { void duplicate(); }}>
            {busy ? "Duplicating…" : "Duplicate project"}
          </MenuItem>
          <MenuItem icon={<History className="h-4 w-4" />} disabled={!projectId} onClick={() => { close(); setHistoryOpen(true); }}>Version history</MenuItem>
          <MenuItem icon={<Keyboard className="h-4 w-4" />} hint="?" onClick={() => { close(); setShortcutsOpen(true); }}>Keyboard shortcuts</MenuItem>
          <div className="my-1 h-px bg-line" />
          <MenuItem icon={<LayoutGrid className="h-4 w-4" />} onClick={() => { close(); router.push("/dashboard/projects"); }}>All projects</MenuItem>
          {err && <p role="alert" className="px-3.5 pb-2 text-[12px] text-error">{err}</p>}
        </div>
      )}
    </Dropdown>
  );
}

/** Export + a ▾ with the other ways to take the work out. */
export function ExportSplitButton({ title }: { title: string }) {
  const setExportOpen = useEditorStore((s) => s.setExportOpen);
  const doc = useEditorStore((s) => s.doc);
  const hasCaptions = doc.tracks.caption.some((c) => !c.hidden && c.text.trim());

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={() => setExportOpen(true)}
        className="flex h-9 items-center gap-1.5 rounded-l-editor-full bg-editor-accent pl-3 pr-2.5 text-[13px] md:pl-4 md:pr-3 font-semibold text-editor-bg transition-colors hover:bg-editor-accent-hover"
      >
        <Film className="h-4 w-4 max-md:hidden" aria-hidden="true" />
        Export
      </button>
      <Dropdown
        align="right"
        className="w-64"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="More export options"
            className="flex h-9 items-center rounded-r-editor-full border-l border-black/20 bg-editor-accent px-2 text-editor-bg transition-colors hover:bg-editor-accent-hover"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
      >
        {({ close }) => (
          <div className="py-1">
            <MenuItem icon={<Film className="h-4 w-4" />} hint="1 credit" onClick={() => { close(); setExportOpen(true); }}>Export video (MP4)</MenuItem>
            <MenuItem icon={<Captions className="h-4 w-4" />} hint="free" disabled={!hasCaptions} onClick={() => { close(); downloadCaptionsSrt(doc, title); }}>
              Download captions (.srt)
            </MenuItem>
          </div>
        )}
      </Dropdown>
    </div>
  );
}
