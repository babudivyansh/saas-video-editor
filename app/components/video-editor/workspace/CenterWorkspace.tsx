"use client";

import PreviewCanvas from "./PreviewCanvas";
import PlaybackControls from "./PlaybackControls";
import AspectRatioPicker from "./AspectRatioPicker";
import FloatingToolbar from "./FloatingToolbar";
import { T } from "../editorTheme";

export default function CenterWorkspace() {
  return (
    <div
      className="flex flex-col flex-1 min-h-0 overflow-hidden items-center"
      style={{ background: T.bg }}
    >
      {/* Aspect ratio + device preview bar */}
      <div
        className="w-full flex items-center justify-center px-4 flex-shrink-0"
        style={{ height: 44, borderBottom: `1px solid ${T.border}` }}
      >
        <AspectRatioPicker />
      </div>

      {/* Video preview area — fills remaining height */}
      <div className="relative flex-1 flex items-center justify-center w-full min-h-0 py-3">
        <FloatingToolbar />
        <PreviewCanvas />
      </div>

      {/* Playback controls */}
      <div className="w-full flex-shrink-0" style={{ borderTop: `1px solid ${T.border}` }}>
        <PlaybackControls />
      </div>
    </div>
  );
}
