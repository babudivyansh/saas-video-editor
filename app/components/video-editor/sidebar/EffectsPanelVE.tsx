"use client";

import { useEditorStore } from "../store/editorStore";
import type { EffectId, VideoClipData } from "@/lib/track-editor-types";

const VIDEO_EFFECTS: { id: EffectId; label: string; icon: string; category: string }[] = [
  { id: "cinematic", label: "Cinematic", icon: "🎬", category: "Look" },
  { id: "vhs",       label: "VHS",       icon: "📼", category: "Look" },
  { id: "glitch",    label: "Glitch",    icon: "⚡", category: "Look" },
  { id: "film-grain",label: "Film Grain",icon: "🎞", category: "Look" },
  { id: "retro",     label: "Retro",     icon: "🌅", category: "Look" },
  { id: "neon",      label: "Neon",      icon: "💫", category: "Look" },
  { id: "rgb-split", label: "RGB Split", icon: "🌈", category: "Look" },
  { id: "blur",      label: "Blur",      icon: "💧", category: "Look" },
  { id: "viral-zoom",label: "Viral Zoom",icon: "🔥", category: "Motion" },
  { id: "punch-in",  label: "Punch In",  icon: "👊", category: "Motion" },
  { id: "shake",     label: "Shake",     icon: "📳", category: "Motion" },
  { id: "bounce",    label: "Bounce",    icon: "⬆", category: "Motion" },
  { id: "zoom",      label: "Zoom",      icon: "🔍", category: "Motion" },
  { id: "pan",       label: "Pan",       icon: "↔", category: "Motion" },
  { id: "face-focus",label: "Face Focus",icon: "😊", category: "AI" },
  { id: "dynamic-crop",label:"Dyn Crop", icon: "✂", category: "AI" },
];

export default function EffectsPanelVE() {
  const selectedClipId = useEditorStore(s => s.selectedClipId);
  const present = useEditorStore(s => s.present);
  const updateClipData = useEditorStore(s => s.updateClipData);

  const selectedClip = selectedClipId
    ? present.tracks.flatMap(t => t.clips).find(c => c.id === selectedClipId)
    : null;

  const appliedEffects: EffectId[] = selectedClip?.data.kind === "video"
    ? (selectedClip.data as VideoClipData).effects
    : [];

  function toggleEffect(effectId: EffectId) {
    if (!selectedClipId || selectedClip?.data.kind !== "video") return;
    const current = (selectedClip.data as VideoClipData).effects;
    const next = current.includes(effectId)
      ? current.filter(e => e !== effectId)
      : [...current, effectId];
    updateClipData(selectedClipId, { effects: next } as Partial<VideoClipData>);
  }

  const categories = [...new Set(VIDEO_EFFECTS.map(e => e.category))];

  return (
    <div className="flex flex-col gap-3 p-3">
      {!selectedClipId && (
        <div className="text-center py-3">
          <p className="text-xs" style={{ color: "#98a0ae" }}>Select a video clip to apply effects</p>
        </div>
      )}
      {categories.map(cat => (
        <div key={cat}>
          <p className="text-xs font-medium mb-1.5" style={{ color: "#5a6170" }}>{cat}</p>
          <div className="grid grid-cols-4 gap-1.5">
            {VIDEO_EFFECTS.filter(e => e.category === cat).map(effect => {
              const active = appliedEffects.includes(effect.id);
              return (
                <button
                  key={effect.id}
                  onClick={() => toggleEffect(effect.id)}
                  className="flex flex-col items-center gap-1 p-2 rounded-lg transition-all"
                  style={{
                    background: active ? "#e8edff" : "#e4e7ec",
                    border: `1px solid ${active ? "#335cff" : "#e4e7ec"}`,
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = "#d3d8e0"; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = "#e4e7ec"; }}
                >
                  <span style={{ fontSize: 18 }}>{effect.icon}</span>
                  <span style={{ fontSize: 9, color: active ? "#335cff" : "#5a6170" }}>{effect.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
