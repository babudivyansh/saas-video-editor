import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Settings } from "@clipiro/shared";
import { getAccount, getActivity, getBrandKit, getClonedVoices, getNotifications, getSettings, getVoiceLibrary, saveSettings } from "@mocks/account";

export const youKeys = {
  account: ["you", "account"] as const,
  activity: ["you", "activity"] as const,
  clones: ["you", "voices", "cloned"] as const,
  library: ["you", "voices", "library"] as const,
  brandKit: ["you", "brand-kit"] as const,
  notifications: ["you", "notifications"] as const,
  settings: ["you", "settings"] as const,
};

export const useAccount = () => useQuery({ queryKey: youKeys.account, queryFn: getAccount });
export const useActivity = () => useQuery({ queryKey: youKeys.activity, queryFn: getActivity });
export const useClonedVoices = () => useQuery({ queryKey: youKeys.clones, queryFn: getClonedVoices });
export const useVoiceLibrary = () => useQuery({ queryKey: youKeys.library, queryFn: getVoiceLibrary, staleTime: 60 * 60_000 });
export const useBrandKit = () => useQuery({ queryKey: youKeys.brandKit, queryFn: getBrandKit });
export const useNotifications = () => useQuery({ queryKey: youKeys.notifications, queryFn: getNotifications });
export const useSettings = () => useQuery({ queryKey: youKeys.settings, queryFn: getSettings });

/** Saves a setting and shows it at once; rolls back if the save fails. */
export function useSaveSettings(onError: (e: unknown) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveSettings,
    onMutate: async (patch: Partial<Settings>) => {
      await qc.cancelQueries({ queryKey: youKeys.settings });
      const before = qc.getQueryData<Settings>(youKeys.settings);
      if (before) qc.setQueryData<Settings>(youKeys.settings, { ...before, ...patch });
      return { before };
    },
    onError: (e, _patch, ctx) => {
      if (ctx?.before) qc.setQueryData(youKeys.settings, ctx.before);
      onError(e);
    },
    onSuccess: (s) => qc.setQueryData(youKeys.settings, s),
  });
}

/** "Sep 26", "Today", "Yesterday". */
export function dayLabel(iso: string, now: Date) {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(now) - start(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
