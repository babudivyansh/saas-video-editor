"use client";

// Virtualized chronological list of every caption cue — the left panel's
// answer to "hundreds of tiny timeline blocks are unreadable": full text is
// readable here, clicking selects + seeks, and per-row delete/lock/hide/merge
// live here instead of a timeline hover toolbar (see CaptionTimelineClip.tsx,
// deliberately left without one for exactly this reason).

import React, { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Trash2, Lock, LockOpen, Eye, EyeOff, Combine, Captions } from "lucide-react";
import { useEditorStore } from "../../../store/editorStore";
import { fmtDuration } from "../shared/assetData";
import { EmptyState, IconButton } from "../../ui";
import type { CaptionClip } from "@/lib/editor/types";

const ROW_HEIGHT = 56;

export default function CaptionListSection() {
  const clips = useEditorStore((s) => s.doc.tracks.caption); // already stored sorted by timelineStart
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const updateClip = useEditorStore((s) => s.updateClip);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const mergeCaptionClips = useEditorStore((s) => s.mergeCaptionClips);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: clips.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
  });

  if (clips.length === 0) {
    return (
      <EmptyState
        icon={<Captions className="h-5 w-5" />}
        message="Generate captions to see cues here."
      />
    );
  }

  const selectAndSeek = (clip: CaptionClip) => {
    select({ clipId: clip.id, track: "caption" });
    setCurrentTime(clip.timelineStart);
  };

  const deleteCue = (clip: CaptionClip) => {
    select({ clipId: clip.id, track: "caption" });
    deleteSelected();
  };

  return (
    <div ref={parentRef} className="max-h-80 overflow-y-auto rounded-editor-md border border-editor-border">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((item) => {
          const clip = clips[item.index];
          const next = clips[item.index + 1];
          return (
            <div
              key={clip.id}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: item.size, transform: `translateY(${item.start}px)` }}
              onClick={() => selectAndSeek(clip)}
              className={`flex cursor-pointer items-center gap-1.5 border-b border-editor-border px-2 ${
                selection?.clipId === clip.id ? "bg-editor-accent/10" : "hover:bg-editor-card"
              } ${clip.hidden ? "opacity-40" : ""}`}
            >
              <div className="min-w-0 flex-1 py-1.5">
                <p className="text-[9px] font-semibold text-editor-text-faint">
                  {fmtDuration(clip.timelineStart)} – {fmtDuration(clip.timelineStart + clip.duration)}
                </p>
                <CueTextInput clip={clip} />
              </div>
              {/* stopPropagation here (not per-button — IconButton's onClick takes
                  no event arg) keeps these actions from also triggering the
                  row's select-and-seek onClick above. */}
              <div className="flex flex-shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                {next && (
                  <IconButton
                    icon={<Combine className="h-3 w-3" />}
                    label="Merge with next"
                    size="sm"
                    onClick={() => mergeCaptionClips(clip.id, next.id)}
                  />
                )}
                <IconButton
                  icon={clip.locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
                  label={clip.locked ? "Unlock" : "Lock"}
                  size="sm"
                  active={clip.locked}
                  onClick={() => updateClip("caption", clip.id, { locked: !clip.locked }, true)}
                />
                <IconButton
                  icon={clip.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  label={clip.hidden ? "Show" : "Hide"}
                  size="sm"
                  active={clip.hidden}
                  onClick={() => updateClip("caption", clip.id, { hidden: !clip.hidden }, true)}
                />
                <IconButton icon={<Trash2 className="h-3 w-3" />} label="Delete" size="sm" onClick={() => deleteCue(clip)} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Inline single-line quick-edit — same word-count-aware words[] preservation
// rule as the properties panel's Basic tab (CaptionClipProps.tsx): editing
// text without changing the word count remaps word strings positionally
// (keeps karaoke timing); changing the count drops words[]/highlightMode.
// No local state — clip.text IS the controlled value; updateClip is
// synchronous (zustand), so the store round-trip is invisible per keystroke.
function CueTextInput({ clip }: { clip: CaptionClip }) {
  const updateClip = useEditorStore((s) => s.updateClip);

  const handleChange = (text: string) => {
    if (clip.words) {
      const newWords = text.trim().split(/\s+/).filter(Boolean);
      if (newWords.length === clip.words.length) {
        updateClip("caption", clip.id, { text, words: clip.words.map((w, i) => ({ ...w, word: newWords[i] })) }, false);
        return;
      }
      updateClip("caption", clip.id, { text, words: undefined, highlightMode: "none" }, false);
      return;
    }
    updateClip("caption", clip.id, { text }, false);
  };

  return (
    <input
      value={clip.text}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={() => updateClip("caption", clip.id, {}, true)}
      onClick={(e) => e.stopPropagation()}
      className="w-full truncate bg-transparent text-xs text-editor-text outline-none"
    />
  );
}
