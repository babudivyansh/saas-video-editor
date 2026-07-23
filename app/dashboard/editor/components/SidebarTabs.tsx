"use client";

// Left sidebar: icon rail + the active panel, with a collapse toggle that
// hides the panel and leaves just the icon rail.

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Clapperboard,
  Image as ImageIcon,
  Video,
  Music2,
  Type,
  Captions,
  Sticker as StickerIcon,
  Wand2,
  Filter as FilterIcon,
  ArrowLeftRight,
  Keyboard,
  ChevronLeft,
} from "lucide-react";
import { useEditorStore, type PanelKind } from "../store/editorStore";
import { useIsCompactEditor } from "../hooks/useIsCompactEditor";
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
  { id: "media", label: "Media", icon: <Clapperboard className="h-5 w-5" /> },
  { id: "image", label: "Image", icon: <ImageIcon className="h-5 w-5" /> },
  { id: "video", label: "Video", icon: <Video className="h-5 w-5" /> },
  { id: "audio", label: "Audio", icon: <Music2 className="h-5 w-5" /> },
  { id: "text", label: "Text", icon: <Type className="h-5 w-5" /> },
  { id: "caption", label: "Caption", icon: <Captions className="h-5 w-5" /> },
  { id: "sticker", label: "Sticker", icon: <StickerIcon className="h-5 w-5" /> },
  { id: "effect", label: "Effect", icon: <Wand2 className="h-5 w-5" /> },
  { id: "filter", label: "Filter", icon: <FilterIcon className="h-5 w-5" /> },
  { id: "transition", label: "Transition", icon: <ArrowLeftRight className="h-5 w-5" /> },
  { id: "keyboard", label: "Keys", icon: <Keyboard className="h-5 w-5" /> },
];

export default function SidebarTabs() {
  const activePanel = useEditorStore((s) => s.activePanel);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const isCompact = useIsCompactEditor();
  const [collapsed, setCollapsed] = useState(false);

  // Below `xl` (tablet range — phones are already blocked by EditorShell's
  // own gate), default the panel closed so PreviewStage gets full width;
  // tapping a tab still opens it, now as an overlay instead of a push.
  useEffect(() => {
    setCollapsed(isCompact);
  }, [isCompact]);

  return (
    <aside className="relative flex h-full flex-shrink-0 border-r border-editor-border bg-editor-panel">
      {/* Backdrop — overlay mode only (below xl), dismisses the panel */}
      {isCompact && !collapsed && (
        <div className="fixed inset-0 z-30 bg-black/30 xl:hidden" onClick={() => setCollapsed(true)} />
      )}
      {/* Icon rail — icon + always-visible label (11 distinct content-type
          tabs benefit from a text label, unlike single-purpose icon buttons
          elsewhere in the chrome). */}
      <div className="flex w-16 flex-col items-center gap-1 overflow-y-auto border-r border-editor-border py-3">
        {TABS.map((tab) => {
          const active = activePanel === tab.id && !collapsed;
          return (
            <motion.button
              key={tab.id}
              type="button"
              onClick={() => {
                if (collapsed && activePanel === tab.id) setCollapsed(false);
                setActivePanel(tab.id);
                setCollapsed(false);
              }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className={`flex w-14 flex-shrink-0 flex-col items-center gap-1 rounded-editor-md py-2 text-[10px] font-semibold transition-colors cursor-pointer ${
                active
                  ? "bg-editor-accent/15 text-editor-accent shadow-editor-glow"
                  : "text-editor-text-muted hover:bg-editor-card hover:text-editor-text"
              }`}
            >
              {tab.icon}
              {tab.label}
            </motion.button>
          );
        })}
      </div>

      {/* Active panel. overflow:hidden lives on this animating wrapper (not
          the scrolling inner div) so the collapse motion doesn't fight the
          panel's own vertical scrollbar. */}
      <motion.div
        animate={{ width: collapsed ? 0 : 320, opacity: collapsed ? 0 : 1 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        style={{ overflow: "hidden" }}
        className="fixed inset-y-0 left-16 z-40 bg-editor-bg shadow-2xl xl:static xl:inset-auto xl:left-auto xl:z-auto xl:shadow-none"
      >
        <div className="h-full w-80 overflow-y-auto overflow-x-hidden">
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
      </motion.div>

      {/* Collapse/expand toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "Expand panel" : "Collapse panel"}
        title={collapsed ? "Expand panel" : "Collapse panel"}
        className="absolute top-1/2 -right-3 z-50 flex h-8 w-6 -translate-y-1/2 items-center justify-center rounded-editor-sm border border-editor-border bg-editor-elevated text-editor-text-muted shadow-editor-sm transition-colors hover:bg-editor-card hover:text-editor-text cursor-pointer"
      >
        <ChevronLeft className={`h-3.5 w-3.5 transition-transform ${collapsed ? "rotate-180" : ""}`} />
      </button>
    </aside>
  );
}
