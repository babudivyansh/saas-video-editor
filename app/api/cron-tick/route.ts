import { NextRequest, NextResponse, after } from "next/server";
import { env } from "@/lib/env";
import { cronSecretMatches } from "@/lib/cron-auth";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { CRON_SCHEDULE, isDue, type CronScheduleEntry } from "@/lib/cron-schedule";

// GET /api/cron-tick — the scheduler for hosts without cron.
//
// Hostinger's Node.js hosting has no cron and ignores `crontab` over SSH, so
// the jobs in ops/crontab never ran in production. One external job (e.g.
// cron-job.org) calls this route every minute with
//   Authorization: Bearer <CRON_SECRET>
// and it runs whatever is due from lib/cron-schedule.ts — each job through its
// own /api/cron/* route, with that route's own secret, so auth, outcome
// tracking and /admin/ops all work exactly as they would under real cron.
//
// Two safety properties:
//   • Catch-up: the last CATCH_UP_MINUTES are considered, so a scheduler that
//     skips or delays a minute doesn't silently drop a daily job.
//   • Exactly once: each (job, minute) slot is claimed in Redis with SET NX
//     before it runs, so a duplicate or retried tick never runs a job twice.
//
// Deliberately outside app/api/cron/: every route in there must have its own
// ops/crontab line (scripts/check-cron-coverage.mjs), and this isn't a job.

const CATCH_UP_MINUTES = 5;
// Claims only need to outlive the catch-up window; a day is plenty of margin.
const CLAIM_TTL_SEC = 24 * 60 * 60;

function minuteFloor(d: Date): Date {
  return new Date(Math.floor(d.getTime() / 60_000) * 60_000);
}

/** Slots in the catch-up window where `entry` was due, newest last. */
function dueSlots(entry: CronScheduleEntry, now: Date): Date[] {
  const slots: Date[] = [];
  for (let i = CATCH_UP_MINUTES - 1; i >= 0; i--) {
    const at = new Date(now.getTime() - i * 60_000);
    if (isDue(entry.schedule, at)) slots.push(at);
  }
  return slots;
}

async function runJob(origin: string, entry: CronScheduleEntry, secret: string): Promise<void> {
  try {
    const res = await fetch(`${origin}${entry.path}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    // The job route records its own outcome (lib/cron-tracking.ts); this is
    // just a breadcrumb in the server log.
    if (!res.ok) logger.warn("cron-tick", `${entry.path} answered ${res.status}`);
  } catch (e) {
    logger.error("cron-tick", `${entry.path} could not be called`, e);
  }
}

export async function GET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  if (!secret || !cronSecretMatches(req, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = minuteFloor(new Date());
  const toRun: CronScheduleEntry[] = [];
  const missingSecret: string[] = [];

  for (const entry of CRON_SCHEDULE) {
    const slots = dueSlots(entry, now);
    if (slots.length === 0) continue;
    // Claim every due slot; run once if we won any. Several missed runs of a
    // frequent job (a */2 sweep after a 5-minute outage) collapse into one.
    let claimed = false;
    for (const slot of slots) {
      if (await redis.setNx(`cron:tick:${entry.path}:${slot.toISOString()}`, "1", CLAIM_TTL_SEC)) claimed = true;
    }
    if (!claimed) continue;
    if (!env[entry.secret]) {
      missingSecret.push(entry.path);
      continue;
    }
    toRun.push(entry);
  }

  if (missingSecret.length > 0) {
    logger.error("cron-tick", `skipped ${missingSecret.length} job(s) whose secret is not set`, { missingSecret });
  }

  // Answer the scheduler straight away (cron-job.org gives up after 30s);
  // the jobs themselves run after the response, in parallel.
  const origin = req.nextUrl.origin;
  after(() => Promise.all(toRun.map((entry) => runJob(origin, entry, env[entry.secret] as string))));

  await redis.set("cron:tick:last", now.toISOString(), "EX", CLAIM_TTL_SEC).catch(() => {});

  return NextResponse.json({
    ok: true,
    at: now.toISOString(),
    started: toRun.map((e) => e.path),
    ...(missingSecret.length ? { missingSecret } : {}),
  });
}
