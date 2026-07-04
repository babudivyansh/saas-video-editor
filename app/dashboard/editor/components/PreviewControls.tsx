"use client";

// Transport controls under the preview: play/pause + time readout.

import React from "react";
import { useEditorStore } from "../store/editorStore";

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t % 1) * 100);
  return `${m}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

export default function PreviewControls({ totalDuration }: { totalDuration: number }) {
  const playing = useEditorStore((s) => s.playing);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const currentTime = useEditorStore((s) => s.currentTime);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);

  return (
    <div className="flex flex-shrink-0 items-center gap-3">
      <button
        onClick={() => setCurrentTime(0)}
        aria-label="Go to start"
        className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
          <path d="M6 5h2v14H6zM20 5l-10 7 10 7V5z" />
        </svg>
      </button>
      <button
        onClick={() => setPlaying(!playing)}
        aria-label={playing ? "Pause" : "Play"}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-600 text-white transition-colors hover:bg-violet-500 cursor-pointer"
      >
        {playing ? (
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
            <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 translate-x-[1px]">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <span className="font-mono text-xs text-zinc-400">
        {fmt(currentTime)} / {fmt(totalDuration)}
      </span>
    </div>
  );
}
