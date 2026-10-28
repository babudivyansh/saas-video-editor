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
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEditorStore, type PanelKind } from "../store/editorStore";
import { useIsCompactEditor } from "../hooks/useIsCompactEditor";
import { useIsPhoneEditor } from "../hooks/useIsPhoneEditor";
import { playUiSound } from "../hooks/useUiSound";
import { PanelHeader, PanelScreen, PanelToaster } from "./ui";

// Only one of these ever renders at a time (the active tab), so all of them
// were loading into the editor's initial bundle for the ones the user isn't
// looking at. ssr:false is safe — this whole shell is itself a "use client"
// component already client-only rendered inside the editor route.
const MediaPanel = dynamic(() => import("./panels/MediaPanel"), { ssr: false });
const StockImagePanel = dynamic(() => import("./panels/StockImagePanel"), { ssr: false });
const StockAudioPanel = dynamic(() => import("./panels/StockAudioPanel"), { ssr: false });
const StockVideoPanel = dynamic(() => import("./panels/StockVideoPanel"), { ssr: false });
const TextPanel = dynamic(() => import("./panels/TextPanel"), { ssr: false });
const CaptionPanel = dynamic(() => import("./panels/CaptionPanel"), { ssr: false });
const StickerPanel = dynamic(() => import("./panels/StickerPanel"), { ssr: false });
const ShapesPanel = dynamic(() => import("./panels/ShapesPanel"), { ssr: false });
const EffectPanel = dynamic(() => import("./panels/EffectPanel"), { ssr: false });
const FilterPanel = dynamic(() => import("./panels/FilterPanel"), { ssr: false });
const TransitionPanel = dynamic(() => import("./panels/TransitionPanel"), { ssr: false });
const AiToolsPanel = dynamic(() => import("./panels/AiToolsPanel"), { ssr: false });

// Seven groups (tabbed redesign, 2026-10). Every group opens on its first
// tab and shows the same header: title, sound switch, sliding tab bar.
const GROUPS: { id: string; label: string; icon: React.ReactNode; panels: { id: PanelKind; label: string }[]; ai?: boolean }[] = [
  { id: "media", label: "Media", icon: <Clapperboard className="h-5 w-5" />, panels: [
    { id: "media", label: "Yours" }, { id: "video", label: "Stock video" }, { id: "image", label: "Images" },
  ] },
  { id: "text", label: "Text", icon: <Type className="h-5 w-5" />, panels: [
    { id: "text", label: "Basic" }, { id: "textTemplates", label: "Templates" }, { id: "textAi", label: "AI write" },
  ] },
  { id: "caption", label: "Captions", icon: <Captions className="h-5 w-5" />, panels: [
    { id: "caption", label: "Generate" }, { id: "captionEdit", label: "Edit" }, { id: "captionStyle", label: "Style" },
  ] },
  { id: "audio", label: "Audio", icon: <Music2 className="h-5 w-5" />, panels: [
    { id: "audio", label: "Music" }, { id: "myAudio", label: "Your audio" },
  ] },
  { id: "elements", label: "Elements", icon: <Shapes className="h-5 w-5" />, panels: [
    { id: "sticker", label: "Stickers" }, { id: "shape", label: "Shapes" },
  ] },
  { id: "effects", label: "Effects", icon: <Wand2 className="h-5 w-5" />, panels: [
    { id: "effect", label: "Effects" }, { id: "filter", label: "Filters" }, { id: "transition", label: "Transitions" },
  ] },
  { id: "ai", label: "AI tools", icon: <Sparkles className="h-5 w-5" />, ai: true, panels: [
    { id: "ai", label: "Selection" }, { id: "aiCaptions", label: "All captions" }, { id: "aiVideo", label: "Video" },
  ] },
];
const groupOf = (p: PanelKind) => GROUPS.find((g) => g.panels.some((x) => x.id === p)) ?? GROUPS[0];

function ActivePanel({ panel }: { panel: PanelKind }) {
  switch (panel) {
    case "media": return <MediaPanel />;
    case "video": return <StockVideoPanel />;
    case "image": return <StockImagePanel />;
    case "text": return <TextPanel tab="basic" />;
    case "textTemplates": return <TextPanel tab="templates" />;
    case "textAi": return <TextPanel tab="ai" />;
    case "caption": return <CaptionPanel tab="generate" />;
    case "captionEdit": return <CaptionPanel tab="edit" />;
    case "captionStyle": return <CaptionPanel tab="style" />;
    case "audio": return <StockAudioPanel />;
    case "myAudio": return <MediaPanel kind="audio" />;
    case "sticker": return <StickerPanel />;
    case "shape": return <ShapesPanel />;
    case "effect": return <EffectPanel />;
    case "filter": return <FilterPanel />;
    case "transition": return <TransitionPanel />;
    case "ai": return <AiToolsPanel tab="selection" />;
    case "aiCaptions": return <AiToolsPanel tab="captions" />;
    case "aiVideo": return <AiToolsPanel tab="video" />;
    default: return null;
  }
}

// The active group's header (title, sound switch, tab bar) and its tab's screen.
function PanelBody() {
  const activePanel = useEditorStore((s) => s.activePanel);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const group = groupOf(activePanel);
  return (
    <>
      <PanelHeader title={group.label} tabs={group.panels} value={activePanel} onChange={setActivePanel} layoutId={`panel-tabs-${group.id}`} />
      <PanelScreen screenKey={activePanel}>
        <ActivePanel panel={activePanel} />
      </PanelScreen>
    </>
  );
}

export default function SidebarTabs() {
  const activePanel = useEditorStore((s) => s.activePanel);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const isCompact = useIsCompactEditor();
  const isPhone = useIsPhoneEditor();
  const [collapsed, setCollapsed] = useState(false);

  // Below `xl` (tablets and phones; phones then get PhoneTools below
  // instead of the rail), default the panel closed so PreviewStage gets full width;
  // tapping a tab still opens it, now as an overlay instead of a push.
  useEffect(() => {
    setCollapsed(isCompact);
  }, [isCompact]);
  // Something else picked a panel (the command bar, the empty-project start
  // screen): show it, even if the panel was collapsed.
  const [lastPanel, setLastPanel] = useState(activePanel);
  if (lastPanel !== activePanel) {
    setLastPanel(activePanel);
    setCollapsed(false);
  }

  if (isPhone) return <PhoneTools collapsed={collapsed} setCollapsed={setCollapsed} />;

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
                if (!active) playUiSound("tab");
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
        <div className="relative h-full w-80">
          <div className="h-full overflow-y-auto overflow-x-hidden">
            <PanelBody />
          </div>
          <PanelToaster />
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

// Phone layout (below md): a bottom tool bar — Edit opens the selected clip's
// properties, the rest open their panel full screen, like every other panel
// in the app (no side drawers).
function PhoneTools({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (c: boolean) => void }) {
  const activePanel = useEditorStore((s) => s.activePanel);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const setPropertiesOpen = useEditorStore((s) => s.setPropertiesOpen);
  const hasSelection = useEditorStore((s) => s.selection !== null);
  const group = groupOf(activePanel);

  return (
    <>
      <nav aria-label="Tools" className="order-last flex h-16 flex-shrink-0 items-center border-t border-editor-border bg-editor-panel px-1">
        <button
          type="button"
          onClick={() => {
            setCollapsed(true);
            setPropertiesOpen(true);
          }}
          className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-editor-md py-1.5 text-[10px] font-semibold ${hasSelection ? "text-editor-text" : "text-editor-text-muted"}`}
        >
          <SlidersHorizontal className="h-5 w-5" />
          Edit
        </button>
        {GROUPS.map((tab) => {
          const active = group.id === tab.id && !collapsed;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setActivePanel(group.id === tab.id ? activePanel : tab.panels[0].id);
                setPropertiesOpen(false);
                setCollapsed(false);
              }}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-editor-md py-1.5 text-[10px] font-semibold ${
                active ? "bg-editor-card text-editor-text [&>svg]:text-editor-accent" : `text-editor-text-muted ${tab.ai ? "[&>svg]:text-[var(--primary)]" : ""}`
              }`}
            >
              {tab.icon}
              {tab.id === "media" ? "Add" : tab.label.replace(" tools", "")}
            </button>
          );
        })}
      </nav>

      {!collapsed && (
        <div role="dialog" aria-label={group.label} className="fixed inset-0 z-40 flex flex-col bg-editor-bg">
          <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-editor-border px-4">
            <p className="text-[14px] font-semibold text-editor-text">{group.label}</p>
            <button type="button" onClick={() => setCollapsed(true)} aria-label={`Close ${group.label}`} className="flex h-9 w-9 items-center justify-center rounded-editor-sm text-editor-text-muted hover:text-editor-text">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative min-h-0 flex-1">
            <div className="h-full overflow-y-auto overflow-x-hidden">
              <PanelBody />
            </div>
            <PanelToaster />
          </div>
        </div>
      )}
    </>
  );
}
