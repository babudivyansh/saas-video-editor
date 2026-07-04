"use client";

// Left sidebar: icon rail (Media / Text / Audio) + the active panel, with a
// collapse toggle that hides the panel and leaves just the icon rail.

import React, { useState } from "react";
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
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className="relative flex h-full flex-shrink-0 border-r border-zinc-800 bg-zinc-900">
      {/* Icon rail */}
      <div className="flex w-16 flex-col items-center gap-1 border-r border-zinc-800 py-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              if (collapsed && activePanel === tab.id) setCollapsed(false);
              setActivePanel(tab.id);
              setCollapsed(false);
            }}
            title={tab.label}
            className={`flex w-14 flex-col items-center gap-1 rounded-xl py-2.5 text-[10px] font-semibold transition-colors cursor-pointer ${
              activePanel === tab.id && !collapsed
                ? "bg-violet-600/15 text-violet-400"
                : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active panel */}
      <div
        className={`overflow-y-auto bg-zinc-950 transition-[width] duration-150 ${collapsed ? "w-0 overflow-hidden" : "w-72"}`}
      >
        <div className="w-72">
          {activePanel === "media" && <MediaPanel />}
          {activePanel === "text" && <TextPanel />}
          {activePanel === "audio" && <AudioPanel />}
        </div>
      </div>

      {/* Collapse/expand toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "Expand panel" : "Collapse panel"}
        title={collapsed ? "Expand panel" : "Collapse panel"}
        className="absolute top-1/2 -right-3 z-10 flex h-8 w-6 -translate-y-1/2 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 text-zinc-400 shadow transition-colors hover:bg-zinc-700 hover:text-zinc-100 cursor-pointer"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`h-3.5 w-3.5 transition-transform ${collapsed ? "rotate-180" : ""}`}
        >
          <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </aside>
  );
}
