"use client";

import { useRef, useState, useEffect } from "react";
import { useSimpleEditorStore } from "../store/simpleEditorStore";
import { CAPTION_STYLES } from "@/lib/caption-styles";
import type { WordTiming } from "@/lib/editor-types";

export default function VideoPreviewPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);

  const videoUrl      = useSimpleEditorStore(s => s.videoUrl);
  const duration      = useSimpleEditorStore(s => s.videoDuration);
  const trimStart     = useSimpleEditorStore(s => s.trimStart);
  const trimEnd       = useSimpleEditorStore(s => s.trimEnd);
  const captions      = useSimpleEditorStore(s => s.captions);
  const captionIdx    = useSimpleEditorStore(s => s.captionStyleIndex);
  const captionsOn    = useSimpleEditorStore(s => s.captionsEnabled);

  const style = CAPTION_STYLES[captionIdx] ?? CAPTION_STYLES[0];

  // Stop at trim end
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const check = () => {
      setCurrent(v.currentTime);
      if (v.currentTime >= trimEnd) { v.pause(); v.currentTime = trimStart; }
    };
    v.addEventListener("timeupdate", check);
    return () => v.removeEventListener("timeupdate", check);
  }, [trimEnd, trimStart]);

  // Seek to trim start when it changes
  useEffect(() => {
    if (videoRef.current) videoRef.current.currentTime = trimStart;
  }, [trimStart]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else          { v.pause(); setPlaying(false); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const t = trimStart + ratio * (trimEnd - trimStart);
    videoRef.current.currentTime = t;
  };

  const progress = duration > 0 ? ((current - trimStart) / Math.max(trimEnd - trimStart, 1)) * 100 : 0;

  // Active caption word
  const activeCap = captionsOn ? captions.find(
    (w: WordTiming) => current * 1000 >= w.start && current * 1000 <= w.end
  ) : null;

  // Group visible caption words (current word + surrounding)
  const visibleWords = captionsOn ? captions.filter(
    (w: WordTiming) => {
      const mid = current * 1000;
      return mid >= w.start - 1500 && mid <= w.end + 1500;
    }
  ) : [];

  if (!videoUrl) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* Video container */}
      <div
        className="relative rounded-2xl overflow-hidden w-full bg-black"
        style={{ aspectRatio: "9/16", maxHeight: "calc(100vh - 340px)", minHeight: 280 }}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-contain"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); }}
        />

        {/* Caption overlay */}
        {captionsOn && visibleWords.length > 0 && (
          <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none px-4">
            <div className="text-center">
              {visibleWords.map((w: WordTiming, i: number) => {
                const isActive = current * 1000 >= w.start && current * 1000 <= w.end;
                return (
                  <span
                    key={i}
                    className="inline-block mx-0.5 transition-all"
                    style={{
                      fontFamily: style.fontFamily,
                      fontSize: "clamp(16px, 3.5vw, 26px)",
                      fontWeight: style.weight,
                      fontStyle: style.italic ? "italic" : "normal",
                      textTransform: style.uppercase ? "uppercase" : "none",
                      color: isActive ? style.highlight : style.color,
                      textShadow: "0 2px 8px rgba(0,0,0,0.9)",
                      transform: isActive ? "scale(1.08)" : "scale(1)",
                    }}
                  >
                    {w.word}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Play/pause overlay */}
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center group"
        >
          {!playing && (
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center transition-all group-hover:scale-110"
              style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
            >
              <svg viewBox="0 0 24 24" fill="white" className="w-7 h-7 ml-1">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
          )}
        </button>
      </div>

      {/* Controls bar */}
      <div
        className="rounded-xl px-4 py-3 flex items-center gap-3"
        style={{ background: "#111118" }}
      >
        <button
          onClick={togglePlay}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
          style={{ color: "#e5e7eb" }}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
        </button>

        <span className="text-xs font-mono w-10 flex-shrink-0" style={{ color: "#9ca3af" }}>
          {fmt(current)}
        </span>

        {/* Scrub bar */}
        <div
          className="flex-1 h-1.5 rounded-full cursor-pointer relative"
          style={{ background: "rgba(255,255,255,0.1)" }}
          onClick={seek}
        >
          <div
            className="absolute h-full rounded-full transition-all"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%`, background: "#7C3AED" }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow"
            style={{ left: `calc(${Math.max(0, Math.min(100, progress))}% - 6px)` }}
          />
        </div>

        <span className="text-xs font-mono w-10 flex-shrink-0 text-right" style={{ color: "#9ca3af" }}>
          {fmt(duration)}
        </span>
      </div>
    </div>
  );
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}
