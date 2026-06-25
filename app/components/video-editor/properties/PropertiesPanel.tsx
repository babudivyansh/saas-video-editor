"use client";

import { useEditorStore } from "../store/editorStore";
import VideoClipProperties from "./VideoClipProperties";
import AudioClipProperties from "./AudioClipProperties";
import TextClipProperties from "./TextClipProperties";

export default function PropertiesPanel() {
  const selectedClipId = useEditorStore(s => s.selectedClipId);
  const present = useEditorStore(s => s.present);

  if (!selectedClipId) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 px-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "#e4e7ec" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#d3d8e0" strokeWidth={1.5} className="w-6 h-6">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-xs font-medium" style={{ color: "#98a0ae" }}>No clip selected</p>
          <p className="text-xs mt-1" style={{ color: "#d3d8e0" }}>Click a clip to edit properties</p>
        </div>
      </div>
    );
  }

  const clip = present.tracks.flatMap(t => t.clips).find(c => c.id === selectedClipId);
  if (!clip) return null;

  return (
    <div className="flex flex-col">
      {clip.data.kind === "video" && <VideoClipProperties clipId={clip.id} data={clip.data} />}
      {clip.data.kind === "audio" && <AudioClipProperties clipId={clip.id} data={clip.data} />}
      {clip.data.kind === "text" && <TextClipProperties clipId={clip.id} data={clip.data} />}
    </div>
  );
}
