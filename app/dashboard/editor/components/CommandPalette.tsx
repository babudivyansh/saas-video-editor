"use client";

// Ctrl/Cmd+K command bar: type to find any editor action and run it with
// Enter. Lists everything the toolbars, panels and shortcuts can already do,
// so a user who doesn't know where something lives can still find it.

import React, { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Modal } from "@/app/components/ui/Modal";
import { useEditorStore, type PanelKind } from "../store/editorStore";
import { downloadCaptionsSrt } from "./header/downloadCaptions";
import { findFillerWords } from "@/lib/editor/ripple-cut";
import { removeFillerWords } from "@/lib/editor/ai-text";

interface Command {
  id: string;
  label: string;
  group: "Edit" | "Add" | "Look" | "Project";
  keys?: string;
  /** Extra words that should match ("cut" finds Split). */
  words?: string;
  disabled?: boolean;
  run: () => void;
}

export default function CommandPalette() {
  const open = useEditorStore((s) => s.paletteOpen);
  const setOpen = useEditorStore((s) => s.setPaletteOpen);
  if (!open) return null;
  return <PaletteBody onClose={() => setOpen(false)} />;
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const s = useEditorStore();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const panel = (p: PanelKind) => () => s.setActivePanel(p);
    const hasSel = !!s.selection;
    const fillerCount = findFillerWords(s.doc).length;
    return [
      { id: "play", group: "Edit", label: s.playing ? "Pause" : "Play", keys: "Space", words: "preview", run: () => s.setPlaying(!s.playing) },
      { id: "split", group: "Edit", label: "Split clip at playhead", keys: "S", words: "cut scissors", run: s.splitAtPlayhead },
      { id: "delete", group: "Edit", label: "Delete selected clip", keys: "Del", words: "remove", disabled: !hasSel, run: s.deleteSelected },
      { id: "duplicate", group: "Edit", label: "Duplicate selected clip", keys: "Ctrl D", words: "copy clone", disabled: !hasSel, run: s.duplicateSelected },
      { id: "copy", group: "Edit", label: "Copy selected clip", keys: "Ctrl C", disabled: !hasSel, run: s.copySelected },
      { id: "paste", group: "Edit", label: "Paste at playhead", keys: "Ctrl V", run: s.pasteAtPlayhead },
      { id: "undo", group: "Edit", label: "Undo", keys: "Ctrl Z", run: s.undoAction },
      { id: "redo", group: "Edit", label: "Redo", keys: "Ctrl Y", run: s.redoAction },
      { id: "silences", group: "Edit", label: "Remove silences (cut long pauses)", words: "pause quiet gap dead air trim tighten", disabled: s.doc.tracks.video.length === 0, run: () => s.setSilenceOpen(true) },
      { id: "fillers-cut", group: "Edit", label: `Cut filler words from the video${fillerCount ? ` (${fillerCount})` : ""}`, words: "um uh like you know remove clean", disabled: fillerCount === 0, run: () => s.rippleCutRanges(findFillerWords(s.doc).map((f) => ({ start: f.start, end: f.end }))) },
      { id: "fillers-captions", group: "Edit", label: "Remove filler words from captions only", words: "um uh like clean", disabled: s.doc.tracks.caption.length === 0, run: () => s.applyCaptionTextEdit(removeFillerWords) },
      { id: "snap", group: "Edit", label: s.snapEnabled ? "Turn snapping off" : "Turn snapping on", words: "magnet", run: s.toggleSnap },
      { id: "media", group: "Add", label: "Upload or add media", words: "video import assets file", run: panel("media") },
      { id: "stock-video", group: "Add", label: "Browse stock video", words: "pexels footage b-roll", run: panel("video") },
      { id: "stock-image", group: "Add", label: "Browse stock images", words: "photo picture", run: panel("image") },
      { id: "music", group: "Add", label: "Add music", words: "audio song sound", run: panel("audio") },
      { id: "text", group: "Add", label: "Add text", words: "title heading", run: panel("text") },
      { id: "captions", group: "Add", label: "Generate captions", words: "subtitles transcript ai", run: panel("caption") },
      { id: "stickers", group: "Add", label: "Add stickers and GIFs", words: "elements emoji giphy", run: panel("sticker") },
      { id: "effects", group: "Look", label: "Effects", words: "glitch shake zoom", run: panel("effect") },
      { id: "filters", group: "Look", label: "Colour filters", words: "filter color grade", run: panel("filter") },
      { id: "transitions", group: "Look", label: "Transitions", words: "fade wipe slide", run: panel("transition") },
      { id: "aspect-916", group: "Project", label: "Change shape to 9:16 vertical", words: "aspect ratio shorts reels tiktok", run: () => s.setAspect("9:16") },
      { id: "aspect-11", group: "Project", label: "Change shape to 1:1 square", words: "aspect ratio feed", run: () => s.setAspect("1:1") },
      { id: "aspect-169", group: "Project", label: "Change shape to 16:9 wide", words: "aspect ratio youtube landscape", run: () => s.setAspect("16:9") },
      { id: "export", group: "Project", label: "Export video", keys: "", words: "render download mp4", run: () => s.setExportOpen(true) },
      { id: "srt", group: "Project", label: "Download captions (.srt)", words: "subtitles file", disabled: s.doc.tracks.caption.length === 0, run: () => downloadCaptionsSrt(s.doc) },
      { id: "shortcuts", group: "Project", label: "Keyboard shortcuts", keys: "?", words: "help keys", run: () => s.setShortcutsOpen(true) },
    ];
  }, [s]);

  const q = query.trim().toLowerCase();
  const results = q
    ? commands.filter((c) => `${c.label} ${c.words ?? ""} ${c.group}`.toLowerCase().includes(q))
    : commands;
  const safeActive = Math.min(active, Math.max(0, results.length - 1));

  const run = (c: Command | undefined) => {
    if (!c || c.disabled) return;
    onClose();
    c.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); run(results[safeActive]); }
  };

  let lastGroup = "";
  return (
    <Modal open onClose={onClose} bare ariaLabel="Command bar" maxWidth="max-w-[640px]">
      <div className="clipiro-editor overflow-hidden rounded-editor-lg border border-editor-border-strong bg-editor-panel text-editor-text shadow-editor-lg">
        <div className="flex items-center gap-3 border-b border-editor-border px-4 py-3.5">
          <Search className="h-4 w-4 text-editor-accent" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search commands — try “split”, “music” or “captions”"
            aria-label="Search commands"
            aria-controls="command-results"
            aria-activedescendant={results[safeActive] ? `cmd-${results[safeActive].id}` : undefined}
            className="flex-1 bg-transparent text-[15px] text-editor-text outline-none placeholder:text-editor-text-faint"
          />
          <kbd className="rounded-editor-sm border border-editor-border-strong px-1.5 py-0.5 text-[11px] text-editor-text-muted">Esc</kbd>
        </div>
        <div ref={listRef} id="command-results" role="listbox" aria-label="Commands" className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 && <p className="px-3 py-6 text-center text-sm text-editor-text-muted">No command matches “{query}”.</p>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <React.Fragment key={c.id}>
                {header && <p className="px-3 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-wide text-editor-text-faint">{header}</p>}
                <button
                  id={`cmd-${c.id}`}
                  type="button"
                  role="option"
                  aria-selected={i === safeActive}
                  aria-disabled={c.disabled}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(c)}
                  className={`flex w-full items-center gap-3 rounded-editor-md px-3 py-2.5 text-left text-[13.5px] transition-colors ${
                    i === safeActive ? "bg-editor-accent/12 text-editor-text ring-1 ring-editor-accent/40" : "text-editor-text"
                  } ${c.disabled ? "opacity-40" : ""}`}
                >
                  <span className="flex-1">{c.label}</span>
                  {c.keys ? <kbd className="rounded-editor-sm border border-editor-border-strong px-1.5 py-0.5 text-[11px] text-editor-text-muted">{c.keys}</kbd> : null}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-editor-border px-4 py-2.5 text-[11.5px] text-editor-text-faint">
          <span>↑ ↓ to move</span><span>Enter to run</span><span className="ml-auto">{results.length} command{results.length === 1 ? "" : "s"}</span>
        </div>
      </div>
    </Modal>
  );
}
