import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountSettings, Settings } from "@clipiro/shared";
import { me, notifications } from "@/lib/api";
import { usePhonePrefs, type PhonePrefs } from "@/lib/phonePrefs";
import { usePush } from "@/lib/push";
import { useVoices } from "../create/queries";

export const youKeys = {
  // The same entry the Create tab reads (createKeys.context): one /me request.
  account: ["account"] as const,
  activity: ["you", "activity"] as const,
  clones: ["you", "voices", "cloned"] as const,
  library: ["you", "voices", "library"] as const,
  brandKit: ["you", "brand-kit"] as const,
  notifications: ["you", "notifications"] as const,
  settings: ["you", "settings"] as const,
};

export const useAccount = () => useQuery({ queryKey: youKeys.account, queryFn: me.account });

/** Credits and minutes in and out, newest first, a page at a time. */
export const useActivity = () =>
  useInfiniteQuery({
    queryKey: youKeys.activity,
    queryFn: ({ pageParam }) => me.activity(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    select: (d) => d.pages.flatMap((p) => p.items),
  });

export const useClonedVoices = () => useQuery({ queryKey: youKeys.clones, queryFn: me.clonedVoices });
/** The catalogue (GET /voices) without the person's own clones, which it lists first. */
export function useVoiceLibrary() {
  const voices = useVoices();
  return { ...voices, data: voices.data?.voices.filter((v) => !v.id.startsWith("clone:")) };
}
export const useBrandKit = () => useQuery({ queryKey: youKeys.brandKit, queryFn: () => me.brandKit().then((r) => r.kit) });

/** The bell, newest first, a page at a time. */
export const useNotifications = () =>
  useInfiniteQuery({
    queryKey: youKeys.notifications,
    queryFn: ({ pageParam }) => notifications.list(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    select: (d) => d.pages.flatMap((p) => p.items),
  });

const PHONE_KEYS = ["aspectRatio", "captionTemplateId", "autoplay"] as const satisfies readonly (keyof PhonePrefs)[];

/**
 * Every setting in one shape: language and the email switches from the
 * server, the rest from this phone (lib/phonePrefs.ts, and the push switches
 * in lib/push.ts).
 */
export function useSettings() {
  const server = useQuery({ queryKey: youKeys.settings, queryFn: me.settings });
  const phone = usePhonePrefs();
  const push = usePush((s) => s.prefs);
  const data: Settings | undefined = server.data
    ? { ...server.data, aspectRatio: phone.aspectRatio, captionTemplateId: phone.captionTemplateId, autoplay: phone.autoplay, push }
    : undefined;
  return { ...server, data };
}

/** Saves a setting where it lives and shows it at once; a server save rolls back if it fails. */
export function useSaveSettings(onError: (e: unknown) => void) {
  const qc = useQueryClient();
  const server = useMutation({
    mutationFn: (patch: Partial<AccountSettings>) => me.updateSettings(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: youKeys.settings });
      const before = qc.getQueryData<AccountSettings>(youKeys.settings);
      if (before) qc.setQueryData<AccountSettings>(youKeys.settings, { ...before, ...patch, email: { ...before.email, ...patch.email } });
      return { before };
    },
    onError: (e, _patch, ctx) => {
      if (ctx?.before) qc.setQueryData(youKeys.settings, ctx.before);
      onError(e);
    },
    onSuccess: (s) => qc.setQueryData(youKeys.settings, s),
  });
  return {
    isPending: server.isPending,
    mutate: (patch: Partial<Settings>) => {
      const phone = Object.fromEntries(PHONE_KEYS.filter((k) => k in patch).map((k) => [k, patch[k]])) as Partial<PhonePrefs>;
      if (Object.keys(phone).length) void usePhonePrefs.getState().set(phone);
      if (patch.push) void usePush.getState().setPrefs(patch.push);
      const remote: Partial<AccountSettings> = {};
      if (patch.language) remote.language = patch.language;
      if (patch.email) remote.email = patch.email;
      if (Object.keys(remote).length) server.mutate(remote);
    },
  };
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
