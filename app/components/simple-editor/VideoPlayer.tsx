"use client";

import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import type { EditorState } from "./types";

export interface VideoPlayerHandle {
  videoEl: HTMLVideoElement | null;
  currentTime: number;
  seek: (t: number) => void;
}

interface Props {
  state: EditorState;
  onTimeUpdate?: (t: number) => void;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(function VideoPlayer({ state, onTimeUpdate }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [loop, setLoop] = useState(false);
  const [muted, setMuted] = useState(false);

  useImperativeHandle(ref, () => ({
    get videoEl() { return videoRef.current; },
    get currentTime() { return videoRef.current?.currentTime ?? 0; },
    seek(t: number) { if (videoRef.current) videoRef.current.currentTime = t; },
  }));

  const { video, volume, speed, crop, rotation } = state;

  // Sync volume & speed to video element
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = Math.min(1, volume);
    v.playbackRate = speed;
  }, [volume, speed]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") { e.preventDefault(); videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause(); }
      if (e.code === "ArrowLeft") { e.preventDefault(); if (videoRef.current) videoRef.current.currentTime -= 5; }
      if (e.code === "ArrowRight") { e.preventDefault(); if (videoRef.current) videoRef.current.currentTime += 5; }
      if (e.code === "KeyM") { setMuted(m => !m); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Mute sync
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  // Stop at trim end
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const check = () => {
      if (v.currentTime >= state.trim.end) {
        if (loop) v.currentTime = state.trim.start;
        else v.pause();
      }
      setCurrent(v.currentTime);
      onTimeUpdate?.(v.currentTime);
    };
    v.addEventListener("timeupdate", check);
    return () => v.removeEventListener("timeupdate", check);
  }, [state.trim, loop, onTimeUpdate]);

  const duration = video?.duration || 1;
  const progress = Math.min(100, (current / duration) * 100);

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    videoRef.current.currentTime = ratio * duration;
  }, [duration]);

  const cropStyle: React.CSSProperties = crop ? {
    clipPath: `inset(${crop.y}% ${100 - crop.x - crop.width}% ${100 - crop.y - crop.height}% ${crop.x}%)`,
  } : {};

  const rotationStyle: React.CSSProperties = rotation !== 0 ? {
    transform: `rotate(${rotation}deg)`,
    transition: "transform 150ms ease",
  } : {};

  if (!video) return null;

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Video */}
      <div className="relative bg-black rounded-xl overflow-hidden" style={{ aspectRatio: "16/9" }}>
        <video
          ref={videoRef}
          src={video.url}
          className="w-full h-full object-contain"
          style={{ ...cropStyle, ...rotationStyle }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />

        {/* Caption overlay */}
        {(() => {
          const cap = state.captions.find(c => current >= c.startTime && current <= c.endTime);
          if (!cap) return null;
          return (
            <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none">
              <span className="bg-black/65 text-white text-sm font-bold px-4 py-1.5 rounded-lg max-w-[85%] text-center">
                {cap.text}
              </span>
            </div>
          );
        })()}

        {/* Text overlays */}
        {state.textOverlays.map(o => {
          const yClass = o.position === "top" ? "top-4" : o.position === "center" ? "top-1/2 -translate-y-1/2" : "bottom-8";
          const sizeClass = o.fontSize === "sm" ? "text-base" : o.fontSize === "md" ? "text-xl" : "text-3xl";
          return (
            <div key={o.id} className={`absolute left-0 right-0 flex justify-center pointer-events-none ${yClass}`}>
              <span className={`${sizeClass} text-center drop-shadow-lg`}
                style={{ color: o.color, fontWeight: o.bold ? 700 : 400, fontStyle: o.italic ? "italic" : "normal" }}>
                {o.text}
              </span>
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="bg-[#111118] rounded-xl px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white transition-colors"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>

        <span className="text-xs text-gray-400 w-10 shrink-0">{fmt(current)}</span>

        {/* Scrub bar */}
        <div className="flex-1 h-1.5 bg-white/10 rounded-full cursor-pointer relative" onClick={seek}
          role="slider" aria-label="Video scrubber" aria-valuenow={current} aria-valuemin={0} aria-valuemax={duration}>
          {/* Trim region highlight */}
          <div className="absolute h-full bg-[#7C3AED]/30 rounded-full"
            style={{ left: `${(state.trim.start / duration) * 100}%`, width: `${((state.trim.end - state.trim.start) / duration) * 100}%` }} />
          <div className="absolute h-full bg-[#7C3AED] rounded-full" style={{ width: `${progress}%` }} />
          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow"
            style={{ left: `calc(${progress}% - 6px)` }} />
        </div>

        <span className="text-xs text-gray-400 w-10 shrink-0 text-right">{fmt(duration)}</span>

        {/* Loop */}
        <button onClick={() => setLoop(l => !l)} aria-label="Toggle loop"
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-xs font-bold ${loop ? "text-[#7C3AED] bg-[#7C3AED]/20" : "text-gray-500 hover:bg-white/10"}`}>
          ↺
        </button>

        {/* Volume */}
        <button onClick={() => setMuted(m => !m)} aria-label="Toggle mute"
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-gray-400 transition-colors">
          {muted || volume === 0 ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          )}
        </button>

        <input type="range" min={0} max={2} step={0.01}
          value={muted ? 0 : volume}
          onChange={e => { setMuted(false); }}
          className="w-16 accent-[#7C3AED]"
          aria-label="Volume slider"
        />
      </div>
    </div>
  );
});

export default VideoPlayer;
