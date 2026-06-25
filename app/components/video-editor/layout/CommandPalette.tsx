"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "../store/editorStore";
import { useEditorUIStore } from "../store/uiStore";
import { T } from "../editorTheme";
import type { SidebarTab, TrackAspect } from "@/lib/track-editor-types";

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
}

// ⌘K command palette — a fast, searchable launcher for every editor action.
export default function CommandPalette() {
  const open = useEditorUIStore(s => s.commandPaletteOpen);
  const setOpen = useEditorUIStore(s => s.setCommandPaletteOpen);
  const setShortcutsOpen = useEditorUIStore(s => s.setShortcutsOpen);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const s = useEditorStore.getState();
    const selected = () => useEditorStore.getState().selectedClipId;
    const aspect = (a: TrackAspect) => () => useEditorStore.getState().setAspect(a);
    const tab = (t: SidebarTab) => () => useEditorStore.getState().setActiveSidebarTab(t);
    return [
      { id: "export", group: "Project", label: "Export video", hint: "⌘E", run: () => s.setExportModalOpen(true) },
      { id: "undo", group: "Edit", label: "Undo", hint: "⌘Z", run: () => useEditorStore.getState().undo() },
      { id: "redo", group: "Edit", label: "Redo", hint: "⌘⇧Z", run: () => useEditorStore.getState().redo() },
      { id: "split", group: "Edit", label: "Split clip at playhead", hint: "S", run: () => { const id = selected(); if (id) useEditorStore.getState().splitClipAtTime(id, useEditorStore.getState().currentTime); } },
      { id: "dupe", group: "Edit", label: "Duplicate clip", hint: "⌘D", run: () => { const id = selected(); if (id) useEditorStore.getState().duplicateClip(id); } },
      { id: "delete", group: "Edit", label: "Delete clip", hint: "Del", run: () => { const id = selected(); if (id) useEditorStore.getState().removeClip(id); } },
      { id: "ripple", group: "Edit", label: "Ripple delete clip", run: () => { const id = selected(); if (id) useEditorStore.getState().rippleDelete(id); } },
      { id: "marker", group: "Edit", label: "Add marker at playhead", hint: "M", run: () => useEditorStore.getState().addMarker(useEditorStore.getState().currentTime) },
      { id: "play", group: "Playback", label: "Play / Pause", hint: "Space", run: () => useEditorStore.getState().togglePlay() },
      { id: "ai-copilot", group: "AI", label: "Open AI Copilot", run: () => s.setAICopilotOpen(true) },
      { id: "ai-captions", group: "AI", label: "Generate captions", run: () => s.setCaptionStudioOpen(true) },
      { id: "ai-reframe", group: "AI", label: "Smart Reframe", run: () => s.setSmartReframeOpen(true) },
      { id: "ai-optimize", group: "AI", label: "Reels Optimizer", run: () => s.setReelsOptimizerOpen(true) },
      { id: "ai-autoedit", group: "AI", label: "Auto-Edit suggestions", run: () => s.setAutoEditOpen(true) },
      { id: "tab-media", group: "Panels", label: "Media library", run: tab("media") },
      { id: "tab-transcript", group: "Panels", label: "Transcript (edit by text)", run: tab("transcript") },
      { id: "tab-captions", group: "Panels", label: "Captions panel", run: tab("captions") },
      { id: "tab-effects", group: "Panels", label: "Effects panel", run: tab("effects") },
      { id: "tab-transitions", group: "Panels", label: "Transitions panel", run: tab("transitions") },
      { id: "tab-audio", group: "Panels", label: "Audio library", run: tab("audio") },
      { id: "tab-templates", group: "Panels", label: "Templates", run: tab("templates") },
      { id: "ar-916", group: "Aspect ratio", label: "Set 9:16 (Reels)", run: aspect("9:16") },
      { id: "ar-169", group: "Aspect ratio", label: "Set 16:9 (YouTube)", run: aspect("16:9") },
      { id: "ar-11", group: "Aspect ratio", label: "Set 1:1 (Square)", run: aspect("1:1") },
      { id: "ar-45", group: "Aspect ratio", label: "Set 4:5 (Feed)", run: aspect("4:5") },
      { id: "help", group: "Help", label: "Keyboard shortcuts", hint: "?", run: () => setShortcutsOpen(true) },
    ];
  }, [setShortcutsOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(c => (c.label + " " + c.group).toLowerCase().includes(q));
  }, [query, commands]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    if (open) { setQuery(""); setTimeout(() => inputRef.current?.focus(), 20); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(filtered.length - 1, a + 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
      if (e.key === "Enter") { e.preventDefault(); const c = filtered[active]; if (c) { c.run(); setOpen(false); } }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, filtered, active, setOpen]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center pt-[12vh]" onMouseDown={() => setOpen(false)}>
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)" }} />
      <div
        className="relative w-full max-w-xl rounded-2xl overflow-hidden"
        style={{ background: T.surface, border: `1px solid ${T.borderStrong}`, boxShadow: T.shadow }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4" style={{ borderBottom: `1px solid ${T.border}`, height: 52 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={T.textFaint} strokeWidth={2} className="w-4 h-4 flex-shrink-0">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search actions… (split, captions, export, 9:16)"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: T.text }}
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: T.surface3, color: T.textFaint }}>ESC</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm" style={{ color: T.textFaint }}>No matching actions</p>
          ) : (
            filtered.map((c, i) => (
              <button
                key={c.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => { c.run(); setOpen(false); }}
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors"
                style={{ background: i === active ? T.accentSoft : "transparent" }}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider flex-shrink-0 w-20 truncate" style={{ color: T.textFaint }}>{c.group}</span>
                  <span className="text-sm truncate" style={{ color: T.text }}>{c.label}</span>
                </span>
                {c.hint && <kbd className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: T.surface3, color: T.textMuted }}>{c.hint}</kbd>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
