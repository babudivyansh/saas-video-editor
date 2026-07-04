"use client";

// Left sidebar: icon rail (Media / Text / Audio) + the active panel.

import React from "react";
import { useEditorStore, type PanelKind } from "../store/editorStore";
import MediaPanel from "./panels/MediaPanel";
import TextPanel from "./panels/TextPanel";
import AudioPanel from "./panels/AudioPanel";

const TABS: { id: PanelKind; label: string; icon: React.ReactNode }[] = [
  {
    id: "media",
    label: "Media",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M10 9.5l5 2.5-5 2.5v-5z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: "text",
    label: "Text",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
        <path d="M4 6h16M12 6v13" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "audio",
    label: "Audio",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
        <path d="M9 18V6l10-2v12" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="6.5" cy="18" r="2.5" />
        <circle cx="16.5" cy="16" r="2.5" />
      </svg>
    ),
  },
];

export default function SidebarTabs() {
  const activePanel = useEditorStore((s) => s.activePanel);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);

  return (
    <aside className="flex flex-shrink-0 border-r border-card-border bg-white">
      {/* Icon rail */}
      <div className="flex w-16 flex-col items-center gap-1 border-r border-card-border py-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActivePanel(tab.id)}
            className={`flex w-14 flex-col items-center gap-1 rounded-xl py-2.5 text-[10px] font-semibold transition-colors cursor-pointer ${
              activePanel === tab.id ? "bg-brand-soft text-brand-deep" : "text-ink-soft hover:bg-surface hover:text-ink"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active panel */}
      <div className="w-72 overflow-y-auto">
        {activePanel === "media" && <MediaPanel />}
        {activePanel === "text" && <TextPanel />}
        {activePanel === "audio" && <AudioPanel />}
      </div>
    </aside>
  );
}
