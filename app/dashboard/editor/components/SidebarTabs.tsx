"use client";

// Left sidebar: icon rail + the active panel, with a collapse toggle that
// hides the panel and leaves just the icon rail.

import React, { useState } from "react";
import { useEditorStore, type PanelKind } from "../store/editorStore";
import MediaPanel from "./panels/MediaPanel";
import StockImagePanel from "./panels/StockImagePanel";
import StockAudioPanel from "./panels/StockAudioPanel";
import StockVideoPanel from "./panels/StockVideoPanel";
import TextPanel from "./panels/TextPanel";
import CaptionPanel from "./panels/CaptionPanel";
import StickerPanel from "./panels/StickerPanel";
import EffectPanel from "./panels/EffectPanel";
import FilterPanel from "./panels/FilterPanel";
import TransitionPanel from "./panels/TransitionPanel";
import KeyboardPanel from "./panels/KeyboardPanel";

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
    id: "image",
    label: "Image",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9.5" r="1.5" />
        <path d="M21 16l-5.5-5.5L7 19" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "video",
    label: "Video",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
        <rect x="2.5" y="6.5" width="13" height="11" rx="2" />
        <path d="M15.5 10l6-3v10l-6-3" strokeLinecap="round" strokeLinejoin="round" />
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
    id: "caption",
    label: "Caption",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M6.5 15h4M12.5 15h5M6.5 11h11" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "sticker",
    label: "Sticker",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
        <path d="M8 3.5h8A4.5 4.5 0 0 1 20.5 8v8a4 4 0 0 1-4 4H8a4.5 4.5 0 0 1-4.5-4.5V8A4.5 4.5 0 0 1 8 3.5z" />
        <path d="M20.5 8h-4A4 4 0 0 1 20.5 8z" />
        <path d="M14.5 20l6-6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "effect",
    label: "Effect",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" strokeLinecap="round" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    id: "filter",
    label: "Filter",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
        <path d="M4 5h16l-6 8v6l-4-2v-4L4 5z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "transition",
    label: "Transition",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
        <rect x="2.5" y="6" width="8" height="12" rx="1.5" />
        <rect x="13.5" y="6" width="8" height="12" rx="1.5" opacity="0.4" />
        <path d="M10.5 12h4" strokeLinecap="round" />
        <path d="M12.5 10l2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "keyboard",
    label: "Keys",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6 14h12" strokeLinecap="round" />
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
      <div className="flex w-16 flex-col items-center gap-1 overflow-y-auto border-r border-zinc-800 py-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              if (collapsed && activePanel === tab.id) setCollapsed(false);
              setActivePanel(tab.id);
              setCollapsed(false);
            }}
            title={tab.label}
            className={`flex w-14 flex-shrink-0 flex-col items-center gap-1 rounded-xl py-2.5 text-[10px] font-semibold transition-colors cursor-pointer ${
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

      {/* Active panel. Width lives only on the outer scroller — the old inner
          w-72 duplicate didn't account for the vertical scrollbar's own
          width, so content was a few pixels too wide and forced a second,
          horizontal scrollbar. w-full here just fills whatever the outer
          box actually has left. */}
      <div
        className={`overflow-y-auto overflow-x-hidden bg-zinc-950 transition-[width] duration-150 ${collapsed ? "w-0 overflow-hidden" : "w-80"}`}
      >
        <div className="w-full">
          {activePanel === "media" && <MediaPanel />}
          {activePanel === "image" && <StockImagePanel />}
          {activePanel === "video" && <StockVideoPanel />}
          {activePanel === "audio" && <StockAudioPanel />}
          {activePanel === "text" && <TextPanel />}
          {activePanel === "caption" && <CaptionPanel />}
          {activePanel === "sticker" && <StickerPanel />}
          {activePanel === "effect" && <EffectPanel />}
          {activePanel === "filter" && <FilterPanel />}
          {activePanel === "transition" && <TransitionPanel />}
          {activePanel === "keyboard" && <KeyboardPanel />}
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
