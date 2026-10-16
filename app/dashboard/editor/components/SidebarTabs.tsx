"use client";

// Left sidebar: icon rail + the active panel, with a collapse toggle that
// hides the panel and leaves just the icon rail.

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  Clapperboard,
  Music2,
  Type,
  Captions,
  Shapes,
  Wand2,
  Sparkles,
  ChevronLeft,
} from "lucide-react";
import { useEditorStore, type PanelKind } from "../store/editorStore";
import { useIsCompactEditor } from "../hooks/useIsCompactEditor";

// Only one of these ever renders at a time (the active tab), so all 11 were
// loading into the editor's initial bundle for the 10 the user isn't looking
// at. ssr:false is safe — this whole shell is itself a "use client" component
// already client-only rendered inside the editor route.
const MediaPanel = dynamic(() => import("./panels/MediaPanel"), { ssr: false });
const StockImagePanel = dynamic(() => import("./panels/StockImagePanel"), { ssr: false });
const StockAudioPanel = dynamic(() => import("./panels/StockAudioPanel"), { ssr: false });
const StockVideoPanel = dynamic(() => import("./panels/StockVideoPanel"), { ssr: false });
const TextPanel = dynamic(() => import("./panels/TextPanel"), { ssr: false });
const CaptionPanel = dynamic(() => import("./panels/CaptionPanel"), { ssr: false });
const StickerPanel = dynamic(() => import("./panels/StickerPanel"), { ssr: false });
const EffectPanel = dynamic(() => import("./panels/EffectPanel"), { ssr: false });
const FilterPanel = dynamic(() => import("./panels/FilterPanel"), { ssr: false });
const TransitionPanel = dynamic(() => import("./panels/TransitionPanel"), { ssr: false });
const AiToolsPanel = dynamic(() => import("./panels/AiToolsPanel"), { ssr: false });

// Seven groups (redesign, 2026-10). Each opens on its first panel; groups with
// more than one panel show a small tab row at the top of the panel.
const GROUPS: { id: string; label: string; icon: React.ReactNode; panels: { id: PanelKind; label: string }[]; ai?: boolean }[] = [
  { id: "media", label: "Media", icon: <Clapperboard className="h-5 w-5" />, panels: [
    { id: "media", label: "Your media" }, { id: "video", label: "Stock video" }, { id: "image", label: "Stock images" },
  ] },
  { id: "text", label: "Text", icon: <Type className="h-5 w-5" />, panels: [{ id: "text", label: "Text" }] },
  { id: "caption", label: "Captions", icon: <Captions className="h-5 w-5" />, panels: [{ id: "caption", label: "Captions" }] },
  { id: "audio", label: "Audio", icon: <Music2 className="h-5 w-5" />, panels: [{ id: "audio", label: "Music" }] },
  { id: "elements", label: "Elements", icon: <Shapes className="h-5 w-5" />, panels: [{ id: "sticker", label: "Stickers & GIFs" }] },
  { id: "effects", label: "Effects", icon: <Wand2 className="h-5 w-5" />, panels: [
    { id: "effect", label: "Effects" }, { id: "filter", label: "Filters" }, { id: "transition", label: "Transitions" },
  ] },
  { id: "ai", label: "AI tools", icon: <Sparkles className="h-5 w-5" />, panels: [{ id: "ai", label: "AI tools" }], ai: true },
];
const groupOf = (p: PanelKind) => GROUPS.find((g) => g.panels.some((x) => x.id === p)) ?? GROUPS[0];

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
        <div data-testid="editor-panel-backdrop" className="fixed inset-0 z-30 bg-black/30 xl:hidden" onClick={() => setCollapsed(true)} />
      )}
      {/* Icon rail — icon + always-visible label. */}
      <div className="flex w-[72px] flex-col items-center gap-1 overflow-y-auto border-r border-editor-border py-3">
        {GROUPS.map((tab, i) => {
          const active = groupOf(activePanel).id === tab.id && !collapsed;
          return (
            <React.Fragment key={tab.id}>
            {tab.ai && i > 0 && <span aria-hidden="true" className="my-1 h-px w-8 bg-editor-border" />}
            <motion.button
              type="button"
              aria-pressed={active}
              onClick={() => {
                setActivePanel(groupOf(activePanel).id === tab.id ? activePanel : tab.panels[0].id);
                setCollapsed(false);
              }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className={`flex w-14 flex-shrink-0 flex-col items-center gap-1 rounded-editor-md py-2 text-[10px] font-semibold transition-colors cursor-pointer ${
                active
                  ? "bg-editor-card text-editor-text [&>svg]:text-editor-accent"
                  : `text-editor-text-muted hover:bg-editor-card hover:text-editor-text ${tab.ai ? "[&>svg]:text-[var(--primary)]" : ""}`
              }`}
            >
              {tab.icon}
              {tab.label}
            </motion.button>
            </React.Fragment>
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
          {groupOf(activePanel).panels.length > 1 && (
            <div role="tablist" aria-label={groupOf(activePanel).label} className="sticky top-0 z-10 flex gap-1 border-b border-editor-border bg-editor-bg/95 p-2 backdrop-blur">
              {groupOf(activePanel).panels.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={activePanel === p.id}
                  onClick={() => setActivePanel(p.id)}
                  className={`flex-1 rounded-editor-sm px-2 py-1.5 text-[12px] font-semibold transition-colors ${activePanel === p.id ? "bg-editor-card text-editor-text" : "text-editor-text-muted hover:text-editor-text"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
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
          {activePanel === "ai" && <AiToolsPanel />}
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
