import { DEFAULT_AUTOCLIP_SETTINGS, type AutoClipSettings, type AutoClipSource } from "@clipiro/shared";
import { create } from "zustand";
import { usePhonePrefs } from "@/lib/phonePrefs";

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

/** A new run starts from Settings → Defaults (ratio and caption style). */
const fresh = (): AutoClipSettings => {
  const p = usePhonePrefs.getState();
  return { ...DEFAULT_AUTOCLIP_SETTINGS, aspectRatio: p.aspectRatio, captionTemplateId: p.captionTemplateId };
};

export const useAutoClipDraft = create<Draft>((set) => ({
  source: null,
  settings: fresh(),
  setSource: (source) => set({ source }),
  update: (patch) => set((d) => ({ settings: { ...d.settings, ...patch } })),
  resetAdvanced: () =>
    set((d) => ({
      settings: { ...d.settings, ...Object.fromEntries(ADVANCED_KEYS.map((k) => [k, DEFAULT_AUTOCLIP_SETTINGS[k]])) },
    })),
  reset: () => set({ source: null, settings: fresh() }),
}));

// Defaults that load (or change) before a run is started apply to it.
usePhonePrefs.subscribe((p, prev) => {
  if (useAutoClipDraft.getState().source) return;
  if (p.aspectRatio !== prev.aspectRatio || p.captionTemplateId !== prev.captionTemplateId) {
    useAutoClipDraft.getState().update({ aspectRatio: p.aspectRatio, captionTemplateId: p.captionTemplateId });
  }
});
