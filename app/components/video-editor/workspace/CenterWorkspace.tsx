"use client";

import PreviewCanvas from "./PreviewCanvas";
import PlaybackControls from "./PlaybackControls";
import AspectRatioPicker from "./AspectRatioPicker";

export default function CenterWorkspace() {
  return (
    <div
      className="flex flex-col flex-1 min-h-0 overflow-hidden items-center"
      style={{ background: "#0d0d0f" }}
    >
      {/* Aspect ratio + device preview bar */}
      <div
        className="w-full flex items-center justify-center px-4 flex-shrink-0"
        style={{ height: 40, borderBottom: "1px solid #1a1a1e" }}
      >
        <AspectRatioPicker />
      </div>

      {/* Video preview area — fills remaining height */}
      <div className="flex-1 flex items-center justify-center w-full min-h-0 py-2">
        <PreviewCanvas />
      </div>

      {/* Playback controls */}
      <div
        className="w-full flex-shrink-0"
        style={{ borderTop: "1px solid #1a1a1e" }}
      >
        <PlaybackControls />
      </div>
    </div>
  );
}
