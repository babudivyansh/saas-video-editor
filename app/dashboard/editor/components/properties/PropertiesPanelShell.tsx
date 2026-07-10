"use client";

// Right panel content dispatcher: for the selected clip, computes the
// per-type tab list (tabConfig.tsx), owns which tab is active, and renders
// that clip type's property editor. Types with only one applicable tab (e.g.
// Audio) skip the Tabs chrome entirely and render straight through — see
// AUDIO_TAB_ITEMS in tabConfig.tsx.

import React, { useEffect } from "react";
import type { AudioClip, ImageClip, TextClip, VideoClip } from "@/lib/editor/types";
import { useEditorStore } from "../../store/editorStore";
import { Tabs, type TabItem } from "../ui";
import { IMAGE_TAB_ITEMS, TEXT_TAB_ITEMS, VIDEO_TAB_ITEMS } from "./tabConfig";
import { useClipTab } from "./useClipTab";
import VideoClipProps from "./VideoClipProps";
import TextClipProps from "./TextClipProps";
import AudioClipProps from "./AudioClipProps";
import ImageClipProps from "./ImageClipProps";

export function VideoProperties({ clip }: { clip: VideoClip }) {
  const [activeTab, setActiveTab] = useClipTab(clip.id, VIDEO_TAB_ITEMS);
  return (
    <TabbedShell items={VIDEO_TAB_ITEMS} activeTab={activeTab} onChange={setActiveTab} layoutId="properties-tabs-video">
      <VideoClipProps clip={clip} activeTab={activeTab} />
    </TabbedShell>
  );
}

export function TextProperties({ clip }: { clip: TextClip }) {
  const [activeTab, setActiveTab] = useClipTab(clip.id, TEXT_TAB_ITEMS);
  const focusTextClipId = useEditorStore((s) => s.focusTextClipId);

  // A focus request (from "Add Text" or double-clicking the clip on canvas)
  // always means "let me type" — jump to Basic, where the Lexical editor lives.
  useEffect(() => {
    if (focusTextClipId === clip.id) setActiveTab("basic");
  }, [focusTextClipId, clip.id, setActiveTab]);

  return (
    <TabbedShell items={TEXT_TAB_ITEMS} activeTab={activeTab} onChange={setActiveTab} layoutId="properties-tabs-text">
      <TextClipProps clip={clip} activeTab={activeTab} />
    </TabbedShell>
  );
}

export function AudioProperties({ clip }: { clip: AudioClip }) {
  return <AudioClipProps clip={clip} />;
}

export function ImageProperties({ clip }: { clip: ImageClip }) {
  const [activeTab, setActiveTab] = useClipTab(clip.id, IMAGE_TAB_ITEMS);
  return (
    <TabbedShell items={IMAGE_TAB_ITEMS} activeTab={activeTab} onChange={setActiveTab} layoutId="properties-tabs-image">
      <ImageClipProps clip={clip} activeTab={activeTab} />
    </TabbedShell>
  );
}

function TabbedShell({
  items,
  activeTab,
  onChange,
  layoutId,
  children,
}: {
  items: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  layoutId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <Tabs items={items} value={activeTab} onChange={onChange} layoutId={layoutId} />
      {children}
    </div>
  );
}
