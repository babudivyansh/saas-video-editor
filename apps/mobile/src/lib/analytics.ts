import type { AppEvent } from "@clipiro/shared";
import Constants from "expo-constants";
import { me } from "@/lib/api";

// First-party product analytics (mobile Phase 15, decision R2 A): a handful of
// events counted per day on Clipiro's own server (POST /events). No third
// party, and nothing about who sent them is stored (docs/mobile/RELEASE.md,
// Data safety). Fire and forget: a lost event never shows up as an error.

const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(Constants.expoConfig?.version ?? "") ? Constants.expoConfig!.version! : "0.0.0";
let opened = false;

export function track(event: AppEvent): void {
  void me.track({ event, appVersion: VERSION }).catch(() => {});
}

/** Once per launch, when a signed-in session is ready. */
export function trackAppOpen(): void {
  if (opened) return;
  opened = true;
  track("app_open");
}
