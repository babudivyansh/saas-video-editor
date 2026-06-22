"use client";

const TRANSITIONS = [
  { id: "fade",       label: "Fade",       icon: "🌫" },
  { id: "slide-left", label: "Slide →",    icon: "➡" },
  { id: "slide-right",label: "Slide ←",   icon: "⬅" },
  { id: "zoom-in",    label: "Zoom In",    icon: "🔍" },
  { id: "zoom-out",   label: "Zoom Out",   icon: "🔎" },
  { id: "blur",       label: "Blur",       icon: "💧" },
  { id: "glitch",     label: "Glitch",     icon: "⚡" },
  { id: "whip-pan",   label: "Whip Pan",   icon: "💨" },
  { id: "flash",      label: "Flash",      icon: "✨" },
  { id: "spin",       label: "Spin",       icon: "🔄" },
];

export default function TransitionsPanelVE() {
  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs" style={{ color: "#52525b" }}>
        Drag a transition between two clips on the timeline.
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {TRANSITIONS.map(t => (
          <div
            key={t.id}
            draggable
            onDragStart={e => {
              e.dataTransfer.setData("application/video-editor-transition", t.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            className="flex items-center gap-2 rounded-lg px-2 py-2.5 cursor-grab transition-all"
            style={{ background: "#1a1a1e", border: "1px solid #27272a" }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = "#3f3f46")}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = "#27272a")}
          >
            <span style={{ fontSize: 18 }}>{t.icon}</span>
            <span className="text-xs font-medium" style={{ color: "#a1a1aa" }}>{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
