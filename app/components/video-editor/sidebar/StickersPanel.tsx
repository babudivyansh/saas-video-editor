"use client";

import { useEditorStore } from "../store/editorStore";

const STICKERS = ["🔥","⚡","💯","🚀","✨","😂","🎉","💎","👑","🎯","💪","🙌","🤩","😍","🎬","📱","💥","🌟","🏆","❤️","🦋","🌈","🎵","🎶","💫","⭐","🔮","🎪","🎭","🎨","🌊","🌙","☀️","🍀","🌸"];

export default function StickersPanel() {
  const addClip = useEditorStore(s => s.addClip);
  const present = useEditorStore(s => s.present);
  const currentTime = useEditorStore(s => s.currentTime);

  function addSticker(emoji: string) {
    const textTracks = present.tracks.filter(t => t.kind === "text");
    if (textTracks.length === 0) return;
    const track = textTracks[0];
    addClip(track.id, {
      start: currentTime,
      duration: 3,
      srcIn: 0,
      srcOut: 3,
      data: {
        kind: "text",
        text: emoji,
        fontFamily: "Arial",
        fontSize: 120,
        color: "#ffffff",
        backgroundColor: "transparent",
        backgroundOpacity: 0,
        bold: false,
        italic: false,
        uppercase: false,
        posX: 0.5,
        posY: 0.5,
        animation: "zoom-in",
        stroke: false,
        strokeColor: "#000000",
        strokeWidth: 0,
        shadow: false,
        shadowColor: "#000000",
      },
    });
  }

  return (
    <div className="p-3">
      <p className="text-xs mb-2" style={{ color: "#52525b" }}>Click to add at playhead position</p>
      <div className="grid grid-cols-5 gap-1.5">
        {STICKERS.map(s => (
          <button
            key={s}
            onClick={() => addSticker(s)}
            className="flex items-center justify-center rounded-lg transition-all"
            style={{ height: 40, background: "#1a1a1e", border: "1px solid #27272a", fontSize: 20 }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = "#3f3f46")}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = "#27272a")}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
