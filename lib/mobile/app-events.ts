import type { AppEvent } from "@clipiro/shared";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

// The Android app's first-party analytics (mobile Phase 15, decision R2 A):
// one counter per day, event and app version. Who sent it is never stored.

/** Counts one event. Never throws: analytics must not fail what it measures. */
export async function recordAppEvent(event: AppEvent, appVersion: string, now = new Date()): Promise<void> {
  const key = { date: now.toISOString().slice(0, 10), event, appVersion };
  try {
    await prisma.appEventDaily.upsert({
      where: { date_event_appVersion: key },
      create: { ...key, count: 1 },
      update: { count: { increment: 1 } },
    });
  } catch (e) {
    logger.warn("app-events", `couldn't count ${event}`, { reason: (e as Error).message });
  }
}
