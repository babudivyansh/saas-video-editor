// Push notifications to the Android app, through the Expo push service
// (https://docs.expo.dev/push-notifications/sending-notifications/). Sent
// from lib/notify.ts beside the in-app bell, for the notification types
// below only. Like notify(), this never throws: a push that can't be sent
// must not fail the work that triggered it.

import type { PushPrefs } from "@clipiro/shared";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { appHref } from "@/lib/mobile/notifications";
import type { NotificationType } from "@/lib/notify";
import { prisma } from "@/lib/prisma";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/** The Expo push API takes at most 100 messages per request. */
const BATCH = 100;

/**
 * The types that reach the phone (lib/notify.ts PUSH_TYPES must list the same), and the switch (Settings → Notifications)
 * that can turn each off. `null` = always sent: money problems the user must
 * act on. Everything else (reviews, admin alerts) stays in the bell only.
 */
export const PUSHED: Partial<Record<NotificationType, { pref: keyof PushPrefs | null; channel: string }>> = {
  autoclip_render_complete: { pref: "renderFinished", channel: "clips" },
  autoclip_render_failed: { pref: "renderFinished", channel: "clips" },
  editor_export_complete: { pref: "renderFinished", channel: "clips" },
  editor_export_failed: { pref: "renderFinished", channel: "clips" },
  billing_payment_failed: { pref: null, channel: "account" },
  billing_subscription_halted: { pref: null, channel: "account" },
};

export type PushInput = { userId: string; type: NotificationType; title: string; body?: string; href?: string };

type ExpoTicket = { status: "ok"; id: string } | { status: "error"; message: string; details?: { error?: string } };

const wants = (prefs: unknown, pref: keyof PushPrefs) => {
  if (!prefs || typeof prefs !== "object") return true; // never set: all on
  return (prefs as Record<string, unknown>)[pref] !== false;
};

export async function sendPushes(inputs: PushInput[]): Promise<void> {
  try {
    const pushable = inputs.filter((i) => PUSHED[i.type]);
    if (pushable.length === 0) return;
    const devices = await prisma.deviceToken.findMany({
      where: { userId: { in: [...new Set(pushable.map((i) => i.userId))] }, provider: "expo" },
      select: { token: true, userId: true, pushPrefs: true },
    });
    const messages = pushable.flatMap((i) => {
      const rule = PUSHED[i.type]!;
      const href = appHref(i.href ?? null);
      return devices
        .filter((d) => d.userId === i.userId && (rule.pref == null || wants(d.pushPrefs, rule.pref)))
        .map((d) => ({
          to: d.token,
          title: i.title,
          body: i.body,
          sound: "default",
          priority: "high",
          channelId: rule.channel,
          // Tapping it opens this screen in the app (null: just the app).
          data: { type: i.type, href },
        }));
    });
    for (let start = 0; start < messages.length; start += BATCH) {
      const batch = messages.slice(start, start + BATCH);
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        logger.warn("push", `expo push request failed (${res.status})`, { count: batch.length });
        continue;
      }
      const tickets = ((await res.json().catch(() => ({}))) as { data?: ExpoTicket[] }).data ?? [];
      // A phone that uninstalled the app (or turned notifications off for
      // good) answers DeviceNotRegistered: stop sending to it.
      const gone = tickets.flatMap((t, n) => (t.status === "error" && t.details?.error === "DeviceNotRegistered" ? [batch[n]!.to] : []));
      if (gone.length) await prisma.deviceToken.deleteMany({ where: { token: { in: gone } } });
      const failed = tickets.filter((t) => t.status === "error" && t.details?.error !== "DeviceNotRegistered");
      if (failed.length) logger.warn("push", `${failed.length} push(es) refused`, { reasons: [...new Set(failed.map((t) => (t.status === "error" ? (t.details?.error ?? t.message) : "")))] });
    }
  } catch (e) {
    logger.warn("push", "push send failed", { reason: (e as Error).message });
  }
}
