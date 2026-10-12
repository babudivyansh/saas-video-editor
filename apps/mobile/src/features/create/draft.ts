import { DEFAULT_AUTOCLIP_SETTINGS, type AutoClipSettings, type AutoClipSource } from "@clipiro/shared";
import { create } from "zustand";

// The AutoClip run being set up. Lives outside the screen so the sheets, and
// the Create hub's "Start from" shortcuts, all edit the same draft.
type Draft = {
  source: AutoClipSource | null;
  settings: AutoClipSettings;
  setSource: (s: AutoClipSource | null) => void;
  update: (patch: Partial<AutoClipSettings>) => void;
  resetAdvanced: () => void;
  reset: () => void;
};

const ADVANCED_KEYS = [
  "smartAutoReframe",
  "reframingPreset",
  "zoomStrength",
  "speakerMode",
  "smoothness",
  "trackingSpeed",
  "removeSilence",
  "silenceThresholdMs",
  "removeFillers",
  "instructions",
] as const;

export const useAutoClipDraft = create<Draft>((set) => ({
  source: null,
  settings: DEFAULT_AUTOCLIP_SETTINGS,
  setSource: (source) => set({ source }),
  update: (patch) => set((d) => ({ settings: { ...d.settings, ...patch } })),
  resetAdvanced: () =>
    set((d) => ({
      settings: { ...d.settings, ...Object.fromEntries(ADVANCED_KEYS.map((k) => [k, DEFAULT_AUTOCLIP_SETTINGS[k]])) },
    })),
  reset: () => set({ source: null, settings: DEFAULT_AUTOCLIP_SETTINGS }),
}));
