"use client";

import { useEditorStore } from "../store/editorStore";
import type { SidebarTab } from "@/lib/track-editor-types";
import { T } from "../editorTheme";
import MediaLibraryPanel from "../sidebar/MediaLibraryPanel";
import TemplatesPanel from "../sidebar/TemplatesPanel";
import CaptionsPanelVE from "../sidebar/CaptionsPanelVE";
import EffectsPanelVE from "../sidebar/EffectsPanelVE";
import TransitionsPanelVE from "../sidebar/TransitionsPanelVE";
import AudioLibraryPanel from "../sidebar/AudioLibraryPanel";
import AIToolsPanel from "../sidebar/AIToolsPanel";
import StickersPanel from "../sidebar/StickersPanel";
import TranscriptPanel from "../ai/TranscriptPanel";

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
    id: "transcript",
    label: "Transcript",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5">
        <path d="M4 6h16M4 10h16M4 14h10M4 18h7" strokeLinecap="round" />
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
    transcript: <TranscriptPanel />,
    captions: <CaptionsPanelVE />,
    effects: <EffectsPanelVE />,
    transitions: <TransitionsPanelVE />,
    audio: <AudioLibraryPanel />,
    stickers: <StickersPanel />,
    templates: <TemplatesPanel />,
    ai: <AIToolsPanel />,
    brand: <div className="p-4 text-sm" style={{ color: T.textFaint }}>Brand Assets coming soon</div>,
  };

  return (
    <div className="flex flex-shrink-0" style={{ width: 300, borderRight: `1px solid ${T.border}` }}>
      {/* Icon tab strip */}
      <div
        className="flex flex-col items-center py-2 gap-1 flex-shrink-0"
        style={{ width: 56, background: T.surface, borderRight: `1px solid ${T.border}` }}
      >
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              className="flex flex-col items-center justify-center gap-0.5 w-12 h-12 rounded-xl transition-all"
              style={{
                color: active ? T.accent : T.textFaint,
                background: active ? T.accentSoft : "transparent",
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = T.textMuted; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = T.textFaint; }}
            >
              {tab.icon}
              <span className="text-[8px] font-medium leading-none">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Panel content */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: T.surface }}>
        <div className="px-3 py-2.5 flex-shrink-0" style={{ borderBottom: `1px solid ${T.border}` }}>
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: T.textMuted }}>
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
