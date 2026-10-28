import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { CRON_SCHEDULE, type CronScheduleEntry } from "@/lib/cron-schedule";
import { cronAuthHeaders } from "@/lib/cron-auth";
import { CRON_ROUTES } from "@/lib/cron-routes";
import type { CronName } from "@/lib/cron-tracking";

// Runs one scheduled job through its own /api/cron/* route handler, with that
// route's own secret — so auth, outcome tracking (lib/cron-tracking.ts) and
// /admin/ops all behave exactly as they do for a scheduled run. Shared by
// /api/cron-tick (the per-minute scheduler) and the admin "Run now" button.
//
// The handler is called in-process, not over HTTP. Both self-call addresses
// failed in production: the request's public origin isn't callable from Node
// behind Hostinger's proxy ("fetch failed"), and on its managed Node hosting
// the app doesn't listen on 127.0.0.1:$PORT either (ECONNREFUSED on every
// tick, Sentry CLIPIRO-WEB-4). A direct call has no address to get wrong.

/** The schedule entry for an exact path, or null. This is the allowlist: an
 * admin can only ever trigger a path that is in CRON_SCHEDULE. */
export function findScheduleEntry(path: string): CronScheduleEntry | null {
  return CRON_SCHEDULE.find((e) => e.path === path) ?? null;
}

/** The secret a job's route expects, or null when it isn't configured. */
export function secretFor(entry: CronScheduleEntry): string | null {
  return env[entry.secret] || null;
}

/** The route name in "/api/cron/<name>?job=…", or null for anything else. */
export function cronRouteName(path: string): CronName | null {
  const name = /^\/api\/cron\/([a-z0-9-]+)(?:\?|$)/.exec(path)?.[1];
  return name && Object.hasOwn(CRON_ROUTES, name) ? (name as CronName) : null;
}

export async function dispatchCronJob(entry: CronScheduleEntry, secret: string): Promise<void> {
  const name = cronRouteName(entry.path);
  if (!name) {
    logger.error("cron-dispatch", `${entry.path} is not a known cron route`);
    return;
  }
  try {
    const { GET } = await CRON_ROUTES[name]();
    // A real request for the route, so it checks its own secret and reads
    // ?job= exactly as it would from an external scheduler. The origin is
    // never dialled; it only makes the URL absolute.
    const req = new NextRequest(new URL(entry.path, env.NEXT_PUBLIC_APP_URL), {
      headers: cronAuthHeaders(secret),
    });
    const res = await GET(req);
    // The job route records its own outcome; this is just a server-log breadcrumb.
    if (!res.ok) logger.warn("cron-dispatch", `${entry.path} answered ${res.status}`);
  } catch (e) {
    // withCronTracking has already recorded a thrown job as failed.
    logger.error("cron-dispatch", `${entry.path} failed`, e);
  }
}

// ── Pause ────────────────────────────────────────────────────────────────────
// A paused job is skipped by /api/cron-tick until resumed. No TTL: a pause is
// an operator decision, not telemetry, and must not silently lapse.

const pausedKey = (path: string) => `cron:paused:${path}`;

export interface CronPause {
  by: string;
  at: string;
  reason?: string;
}

export async function setCronPaused(path: string, pause: CronPause | null): Promise<void> {
  if (pause) await redis.set(pausedKey(path), JSON.stringify(pause));
  else await redis.del(pausedKey(path));
}

/** Paused jobs, by path. Unreadable Redis reads as "nothing paused". */
export async function getCronPauses(): Promise<Map<string, CronPause>> {
  const out = new Map<string, CronPause>();
  await Promise.all(
    CRON_SCHEDULE.map(async (e) => {
      const raw = await redis.get(pausedKey(e.path)).catch(() => null);
      if (!raw) return;
      try {
        out.set(e.path, JSON.parse(raw) as CronPause);
      } catch {
        out.set(e.path, { by: "unknown", at: "" });
      }
    }),
  );
  return out;
}

// ── Manual runs ──────────────────────────────────────────────────────────────

const manualKey = (path: string) => `cron:manual:${path}`;
const MANUAL_TTL_SEC = 14 * 24 * 60 * 60;

export interface CronManualRun {
  by: string;
  at: string;
}

export async function recordManualRun(path: string, run: CronManualRun): Promise<void> {
  await redis.set(manualKey(path), JSON.stringify(run), "EX", MANUAL_TTL_SEC).catch(() => {});
}

export async function getManualRuns(): Promise<Map<string, CronManualRun>> {
  const out = new Map<string, CronManualRun>();
  await Promise.all(
    CRON_SCHEDULE.map(async (e) => {
      const raw = await redis.get(manualKey(e.path)).catch(() => null);
      if (!raw) return;
      try {
        out.set(e.path, JSON.parse(raw) as CronManualRun);
      } catch { /* ignore a malformed entry */ }
    }),
  );
  return out;
}
