"use client";

const TEMPLATES = [
  { id: "viral-reel",    label: "Viral Reel",    icon: "🔥", desc: "9:16 · Hook + CTA" },
  { id: "podcast-clip",  label: "Podcast Clip",  icon: "🎙", desc: "1:1 · Waveform" },
  { id: "yt-shorts",     label: "YT Shorts",     icon: "▶", desc: "9:16 · Fast cuts" },
  { id: "before-after",  label: "Before/After",  icon: "↔", desc: "Split screen" },
  { id: "tutorial",      label: "Tutorial",      icon: "📚", desc: "16:9 · Screen + cam" },
  { id: "meme",          label: "Meme Format",   icon: "😂", desc: "1:1 · Impact text" },
];

export default function TemplatesPanel() {
  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="text-xs" style={{ color: "#52525b" }}>Click a template to apply it to your project.</p>
      <div className="grid grid-cols-2 gap-1.5">
        {TEMPLATES.map(t => (
          <button
            key={t.id}
            className="flex flex-col gap-1 rounded-lg p-3 text-left transition-all"
            style={{ background: "#1a1a1e", border: "1px solid #27272a" }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = "#3f3f46")}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = "#27272a")}
          >
            <span style={{ fontSize: 22 }}>{t.icon}</span>
            <span className="text-xs font-semibold" style={{ color: "#e4e4e7" }}>{t.label}</span>
            <span className="text-xs" style={{ color: "#52525b", fontSize: 9 }}>{t.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
