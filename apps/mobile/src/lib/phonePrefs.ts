import { DEFAULT_AUTOCLIP_SETTINGS, settingsSchema } from "@clipiro/shared";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

// Settings that live on this phone only (decision 5.2: the server keeps
// language and the email switches; push switches are in lib/push.ts).
const KEY = "clipiro.phonePrefs";
const prefsSchema = settingsSchema.pick({ aspectRatio: true, captionTemplateId: true, autoplay: true });
export type PhonePrefs = typeof prefsSchema._output;

export const DEFAULT_PHONE_PREFS: PhonePrefs = {
  aspectRatio: DEFAULT_AUTOCLIP_SETTINGS.aspectRatio,
  captionTemplateId: DEFAULT_AUTOCLIP_SETTINGS.captionTemplateId ?? "boardroom",
  autoplay: true,
};

type State = PhonePrefs & {
  load: () => Promise<void>;
  set: (patch: Partial<PhonePrefs>) => Promise<void>;
};

export const usePhonePrefs = create<State>((set, get) => ({
  ...DEFAULT_PHONE_PREFS,
  load: async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (raw) set(prefsSchema.parse({ ...DEFAULT_PHONE_PREFS, ...JSON.parse(raw) }));
    } catch {
      // unreadable: keep the defaults
    }
  },
  set: async (patch) => {
    set(patch);
    const { aspectRatio, captionTemplateId, autoplay } = get();
    await SecureStore.setItemAsync(KEY, JSON.stringify({ aspectRatio, captionTemplateId, autoplay })).catch(() => {});
  },
}));
