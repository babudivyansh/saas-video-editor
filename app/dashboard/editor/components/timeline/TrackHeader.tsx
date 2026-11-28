"use client";

// Fixed, non-scrolling label column for one timeline track, with the track's
// switches (Phase 1): hide (leaves it out of preview and export), lock (no
// moves, trims or deletes) and, for tracks with sound, mute.

import React from "react";
import { Video, Image as ImageIcon, Type, Music2, Captions, PictureInPicture2, Eye, EyeOff, Lock, LockOpen, Volume2, VolumeX } from "lucide-react";
import type { TrackKind } from "@/lib/editor/types";
import { useEditorStore } from "../../store/editorStore";

const TRACK_ICONS: Record<TrackKind, React.ReactNode> = {
  video: <Video className="h-3.5 w-3.5" />,
  overlay: <PictureInPicture2 className="h-3.5 w-3.5" />,
  image: <ImageIcon className="h-3.5 w-3.5" />,
  text: <Type className="h-3.5 w-3.5" />,
  audio: <Music2 className="h-3.5 w-3.5" />,
  caption: <Captions className="h-3.5 w-3.5" />,
};

const TRACK_TEXT_COLOR: Record<TrackKind, string> = {
  video: "text-editor-track-video",
  overlay: "text-editor-track-overlay",
  image: "text-editor-track-image",
  text: "text-editor-track-text",
  audio: "text-editor-track-audio",
  caption: "text-editor-track-caption",
};

/** Tracks whose clips carry sound. */
const HAS_AUDIO: TrackKind[] = ["video", "overlay", "audio"];

function Toggle({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      title={label}
      onClick={onClick}
      className={`flex h-4 w-4 items-center justify-center rounded-editor-sm transition-colors cursor-pointer ${
        on ? "text-editor-accent" : "text-editor-text-faint hover:text-editor-text"
      }`}
    >
      {children}
    </button>
  );
}

export default function TrackHeader({ kind, label, height }: { kind: TrackKind; label: string; height: string }) {
  const state = useEditorStore((s) => s.doc.trackState?.[kind]);
  const setTrackState = useEditorStore((s) => s.setTrackState);
  const hidden = !!state?.hidden;
  const locked = !!state?.locked;
  const muted = !!state?.muted;

  return (
    <div className={`flex ${height} w-[4.5rem] flex-shrink-0 flex-col items-center justify-center gap-0.5 ${hidden ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-1">
        <span className={TRACK_TEXT_COLOR[kind]}>{TRACK_ICONS[kind]}</span>
        <span className="text-[9px] font-medium text-editor-text-faint">{label}</span>
      </div>
      <div className="flex items-center gap-0.5">
        <Toggle on={hidden} label={hidden ? `Show ${label} track` : `Hide ${label} track`} onClick={() => setTrackState(kind, { hidden: !hidden })}>
          {hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </Toggle>
        <Toggle on={locked} label={locked ? `Unlock ${label} track` : `Lock ${label} track`} onClick={() => setTrackState(kind, { locked: !locked })}>
          {locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
        </Toggle>
        {HAS_AUDIO.includes(kind) && (
          <Toggle on={muted} label={muted ? `Unmute ${label} track` : `Mute ${label} track`} onClick={() => setTrackState(kind, { muted: !muted })}>
            {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
          </Toggle>
        )}
      </div>
    </div>
  );
}
