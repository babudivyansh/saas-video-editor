"use client";

import { useEditorStore } from "../store/editorStore";

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 100);
  return `${m}:${sec.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

export default function PlaybackControls() {
  const isPlaying = useEditorStore(s => s.isPlaying);
  const togglePlay = useEditorStore(s => s.togglePlay);
  const currentTime = useEditorStore(s => s.currentTime);
  const duration = useEditorStore(s => s.duration);
  const volume = useEditorStore(s => s.volume);
  const setVolume = useEditorStore(s => s.setVolume);
  const setCurrentTime = useEditorStore(s => s.setCurrentTime);
  const playbackSpeed = useEditorStore(s => s.playbackSpeed);
  const setPlaybackSpeed = useEditorStore(s => s.setPlaybackSpeed);

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="flex flex-col gap-1.5 px-4 py-2"
      style={{ background: "#ffffff" }}
    >
      {/* Scrub bar */}
      <div className="relative h-1 rounded-full cursor-pointer" style={{ background: "#e4e7ec" }}
        onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          setCurrentTime((x / rect.width) * duration);
        }}
      >
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{ width: `${pct}%`, background: "#335cff" }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white"
          style={{ left: `calc(${pct}% - 6px)`, background: "#335cff", boxShadow: "0 0 6px rgba(37,99,235,0.7)" }}
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between">
        {/* Left: prev / play / next */}
        <div className="flex items-center gap-2">
          <CtrlBtn onClick={() => setCurrentTime(Math.max(0, currentTime - 5))} title="Back 5s">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <polygon points="19 20 9 12 19 4 19 20" fill="currentColor" stroke="none" />
              <line x1="5" y1="19" x2="5" y2="5" strokeLinecap="round" />
            </svg>
          </CtrlBtn>

          <button
            onClick={togglePlay}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all"
            style={{ background: "#335cff" }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#284be0")}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "#335cff")}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </button>

          <CtrlBtn onClick={() => setCurrentTime(Math.min(duration, currentTime + 5))} title="Forward 5s">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" stroke="none" />
              <line x1="19" y1="5" x2="19" y2="19" strokeLinecap="round" />
            </svg>
          </CtrlBtn>

          {/* Timecode */}
          <span className="text-xs font-mono ml-1" style={{ color: "#5a6170" }}>
            {fmtTime(currentTime)} / {fmtTime(duration)}
          </span>
        </div>

        {/* Right: speed + volume */}
        <div className="flex items-center gap-3">
          {/* Speed picker */}
          <select
            value={playbackSpeed}
            onChange={e => setPlaybackSpeed(Number(e.target.value))}
            className="text-xs rounded px-2 py-0.5 border outline-none"
            style={{
              background: "#f6f7f9",
              borderColor: "#e4e7ec",
              color: "#5a6170",
            }}
          >
            {SPEEDS.map(s => (
              <option key={s} value={s}>{s}x</option>
            ))}
          </select>

          {/* Volume */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setVolume(volume === 0 ? 1 : 0)}
              className="transition-colors"
              style={{ color: "#5a6170" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#15181f")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#5a6170")}
            >
              {volume === 0 ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" strokeLinecap="round" />
                  <line x1="17" y1="9" x2="23" y2="15" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" strokeLinecap="round" />
                </svg>
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={e => setVolume(Number(e.target.value))}
              className="w-20 accent-blue-500"
              style={{ height: 2 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function CtrlBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
      style={{ color: "#5a6170" }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#15181f")}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#5a6170")}
    >
      {children}
    </button>
  );
}
