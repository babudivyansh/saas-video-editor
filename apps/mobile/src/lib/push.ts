import { notificationsApi, pushPrefsSchema, type PushPrefs } from "@clipiro/shared";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router, type Href } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Linking } from "react-native";
import { create } from "zustand";
import { api } from "@/lib/api";

// Push notifications: the phone's switches (Settings → Notifications), the
// Android channels, registering this phone's Expo push token with the server
// (POST /devices, with the switches, which the server checks before
// sending — lib/push.ts on the web), and opening the right screen when one
// is tapped.

const notifications = notificationsApi(api);
const PREFS_KEY = "clipiro.pushPrefs";
export const DEFAULT_PUSH_PREFS: PushPrefs = { renderFinished: true, postPublished: true };

/** "unavailable": this build can't get a push token (no EAS project / Firebase config). */
export type PushPermission = "granted" | "undetermined" | "denied" | "unavailable";

type PushState = {
  prefs: PushPrefs;
  permission: PushPermission;
  load: () => Promise<void>;
  setPrefs: (patch: Partial<PushPrefs>) => Promise<void>;
};

export const usePush = create<PushState>((set, get) => ({
  prefs: DEFAULT_PUSH_PREFS,
  permission: "undetermined",
  load: async () => {
    try {
      const raw = await SecureStore.getItemAsync(PREFS_KEY);
      if (raw) set({ prefs: pushPrefsSchema.parse(JSON.parse(raw)) });
    } catch {
      // unreadable: keep the defaults
    }
  },
  setPrefs: async (patch) => {
    const prefs = { ...get().prefs, ...patch };
    set({ prefs });
    await SecureStore.setItemAsync(PREFS_KEY, JSON.stringify(prefs)).catch(() => {});
    await registerForPush({ ask: false }); // tell the server, if registered
  },
}));

const projectId = (): string | undefined => Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

let channelsReady = false;
async function ensureChannels() {
  if (channelsReady) return;
  // Android 13+ only shows the permission prompt once a channel exists.
  await Notifications.setNotificationChannelAsync("clips", { name: "Clips ready", importance: Notifications.AndroidImportance.HIGH });
  await Notifications.setNotificationChannelAsync("account", { name: "Account and billing", importance: Notifications.AndroidImportance.HIGH });
  channelsReady = true;
}

/**
 * Registers this phone for push if notifications are allowed. With `ask`,
 * shows Android's permission prompt first (only when it hasn't been answered:
 * after a "no", Android won't show it again — see openPushSettings). Never
 * throws; returns where permission stands.
 */
export async function registerForPush({ ask }: { ask: boolean }): Promise<PushPermission> {
  try {
    const id = projectId();
    if (!id || !Device.isDevice) {
      usePush.setState({ permission: "unavailable" });
      return "unavailable";
    }
    await ensureChannels();
    let { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status !== "granted" && ask && canAskAgain) ({ status, canAskAgain } = await Notifications.requestPermissionsAsync());
    const permission: PushPermission = status === "granted" ? "granted" : canAskAgain ? "undetermined" : "denied";
    usePush.setState({ permission });
    if (permission !== "granted") return permission;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await notifications.registerDevice({
      token,
      provider: "expo",
      deviceName: Device.modelName ?? undefined,
      appVersion: Constants.expoConfig?.version,
      prefs: usePush.getState().prefs,
    });
    return "granted";
  } catch {
    return usePush.getState().permission; // offline or no Play services: try again next launch
  }
}

/** After a "no", only the system settings can turn notifications on. */
export const openPushSettings = () => Linking.openSettings();

/** Shown while the app is open, too (a toast would be missed on another screen). */
export function configurePushPresentation() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
}

/** The app screen a push opens (lib/mobile/notifications appHref on the server); null = the app as it is. */
function hrefOf(response: Notifications.NotificationResponse | null): string | null {
  const href = response?.notification.request.content.data?.href;
  return typeof href === "string" && href.startsWith("/") ? href : null;
}

/**
 * Opens the screen a tapped push points at: the one that launched the app,
 * and any tapped later. Returns the unsubscribe.
 */
export function openTappedPushes(): () => void {
  const first = hrefOf(Notifications.getLastNotificationResponse());
  if (first) {
    Notifications.clearLastNotificationResponse();
    router.push(first as Href);
  }
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const href = hrefOf(r);
    if (href) router.push(href as Href);
  });
  return () => sub.remove();
}
