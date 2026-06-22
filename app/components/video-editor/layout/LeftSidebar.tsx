"use client";

import { useEditorStore } from "../store/editorStore";
import type { SidebarTab } from "@/lib/track-editor-types";
import MediaLibraryPanel from "../sidebar/MediaLibraryPanel";
import TemplatesPanel from "../sidebar/TemplatesPanel";
import CaptionsPanelVE from "../sidebar/CaptionsPanelVE";
import EffectsPanelVE from "../sidebar/EffectsPanelVE";
import TransitionsPanelVE from "../sidebar/TransitionsPanelVE";
import AudioLibraryPanel from "../sidebar/AudioLibraryPanel";
import AIToolsPanel from "../sidebar/AIToolsPanel";
import StickersPanel from "../sidebar/StickersPanel";

const TABS: { id: SidebarTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "media",
    label: "Media",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
        <rect x="2" y="2" width="20" height="20" rx="2" />
        <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: "captions",
    label: "Captions",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <line x1="6" y1="10" x2="14" y2="10" strokeLinecap="round" />
        <line x1="6" y1="14" x2="11" y2="14" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "effects",
    label: "Effects",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
      </svg>
    ),
  },
  {
    id: "transitions",
    label: "Transitions",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
        <circle cx="8" cy="12" r="5" />
        <circle cx="16" cy="12" r="5" />
      </svg>
    ),
  },
  {
    id: "audio",
    label: "Audio",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
        <path d="M9 18V5l12-2v13" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
  {
    id: "stickers",
    label: "Stickers",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" strokeLinecap="round" />
        <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth={3} strokeLinecap="round" />
        <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth={3} strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "templates",
    label: "Templates",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    id: "ai",
    label: "AI",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
        <path d="M12 8v4l3 3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function LeftSidebar() {
  const activeTab = useEditorStore(s => s.activeSidebarTab);
  const setActiveTab = useEditorStore(s => s.setActiveSidebarTab);

  const panelMap: Record<SidebarTab, React.ReactNode> = {
    media: <MediaLibraryPanel />,
    captions: <CaptionsPanelVE />,
    effects: <EffectsPanelVE />,
    transitions: <TransitionsPanelVE />,
    audio: <AudioLibraryPanel />,
    stickers: <StickersPanel />,
    templates: <TemplatesPanel />,
    ai: <AIToolsPanel />,
    brand: <div className="p-4 text-sm" style={{ color: "#71717a" }}>Brand Assets coming soon</div>,
  };

  return (
    <div className="flex flex-shrink-0" style={{ width: 280, borderRight: "1px solid #27272a" }}>
      {/* Icon tab strip */}
      <div
        className="flex flex-col items-center py-2 gap-1 flex-shrink-0"
        style={{ width: 52, background: "#18181b", borderRight: "1px solid #27272a" }}
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
            className="w-9 h-9 flex items-center justify-center rounded-lg transition-all"
            style={{
              color: activeTab === tab.id ? "#60a5fa" : "#52525b",
              background: activeTab === tab.id ? "#1e3a5f" : "transparent",
            }}
            onMouseEnter={e => {
              if (activeTab !== tab.id) (e.currentTarget as HTMLElement).style.color = "#a1a1aa";
            }}
            onMouseLeave={e => {
              if (activeTab !== tab.id) (e.currentTarget as HTMLElement).style.color = "#52525b";
            }}
          >
            {tab.icon}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "#141416" }}>
        <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: "1px solid #27272a" }}>
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#52525b" }}>
            {TABS.find(t => t.id === activeTab)?.label}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {panelMap[activeTab]}
        </div>
      </div>
    </div>
  );
}
