"use client";

import { useState } from "react";
import { useEditorStore } from "../store/editorStore";

const STOCK_MUSIC = [
  { name: "Upbeat Vibes",   url: "", duration: 120, genre: "Pop" },
  { name: "Chill Lo-Fi",    url: "", duration: 180, genre: "Lo-Fi" },
  { name: "Epic Cinematic", url: "", duration: 90,  genre: "Cinematic" },
  { name: "Hype Energy",    url: "", duration: 60,  genre: "Electronic" },
  { name: "Acoustic Drive", url: "", duration: 150, genre: "Acoustic" },
  { name: "Motivational",   url: "", duration: 200, genre: "Corporate" },
];

function fmtDur(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function AudioLibraryPanel() {
  const [search, setSearch] = useState("");
  const present = useEditorStore(s => s.present);
  const addClip = useEditorStore(s => s.addClip);

  const filtered = STOCK_MUSIC.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()),
  );

  function addAudio(item: typeof STOCK_MUSIC[0]) {
    if (!item.url) return; // stock items without a real URL are placeholders
    const audioTracks = present.tracks.filter(t => t.kind === "audio");
    if (audioTracks.length === 0) return;
    const track = audioTracks[0];
    const lastEnd = track.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
    addClip(track.id, {
      start: lastEnd,
      duration: item.duration,
      srcIn: 0,
      srcOut: item.duration,
      data: { kind: "audio", url: item.url, volume: 0.8, fadeIn: 0.5, fadeOut: 1, muted: false },
    });
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <input
        type="text"
        placeholder="Search music…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="rounded-md px-2 py-1.5 text-xs outline-none"
        style={{ background: "#1e1e22", border: "1px solid #27272a", color: "#e4e4e7" }}
      />
      <p className="text-xs" style={{ color: "#52525b" }}>Stock library (previews only)</p>
      <div className="flex flex-col gap-1">
        {filtered.map(item => (
          <button
            key={item.name}
            onClick={() => addAudio(item)}
            className="flex items-center gap-2 rounded-lg px-2 py-2 transition-all text-left"
            style={{ background: "#1a1a1e", border: "1px solid #27272a" }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = "#3f3f46")}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = "#27272a")}
          >
            <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ background: "#14532d" }}>
              <svg viewBox="0 0 24 24" fill="#4ade80" className="w-4 h-4">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: "#e4e4e7" }}>{item.name}</p>
              <p className="text-xs" style={{ color: "#52525b" }}>{item.genre} · {fmtDur(item.duration)}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
