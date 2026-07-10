// Shared tab vocabulary for the Properties panel — one id/label/icon per
// concern, reused across clip types. Each clip type only lists the tabs it
// actually has content for (see PropertiesPanelShell.tsx).

import { SlidersHorizontal, Move, Wand2, Sparkles, Volume2, Layers, Bot } from "lucide-react";
import type { TabItem } from "../ui";

const TAB_DEFS: Record<string, Omit<TabItem, "id">> = {
  basic: { label: "Basic", icon: <SlidersHorizontal className="h-4 w-4" /> },
  transform: { label: "Transform", icon: <Move className="h-4 w-4" /> },
  adjust: { label: "Adjust", icon: <Wand2 className="h-4 w-4" /> },
  animation: { label: "Animation", icon: <Sparkles className="h-4 w-4" /> },
  audio: { label: "Audio", icon: <Volume2 className="h-4 w-4" /> },
  effects: { label: "Effects", icon: <Layers className="h-4 w-4" /> },
  ai: { label: "AI", icon: <Bot className="h-4 w-4" /> },
};

function items(ids: string[]): TabItem[] {
  return ids.map((id) => ({ id, ...TAB_DEFS[id] }));
}

export const VIDEO_TAB_ITEMS = items(["basic", "animation", "adjust", "audio", "effects", "ai"]);
export const TEXT_TAB_ITEMS = items(["basic", "adjust", "transform", "animation", "ai"]);
export const AUDIO_TAB_ITEMS = items(["basic"]);
export const IMAGE_TAB_ITEMS = items(["basic", "transform", "animation"]);
