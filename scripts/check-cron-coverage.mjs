#!/usr/bin/env node
// Cron coverage check — every scheduled route must actually be scheduled.
//
// The failure this exists to prevent is silent by construction: a cron route
// that nothing ever calls returns no errors, logs nothing, and looks perfectly
// healthy in code review. It has happened twice. A 2026-08 audit found that
// all but four of the documented jobs had never been entered into the
// production crontab, so lifecycle emails, cleanup and re-engagement had never
// fired at all. Later `clip-publish` shipped with a route AND a staleness
// budget but no schedule, so every clip a user scheduled sat pending forever.
//
// Four lists have to agree:
//   1. app/api/cron/*            the routes that exist
//   2. ops/crontab               what production is told to run
//   3. KNOWN_CRON_NAMES          what /admin/ops/diagnostics watches for
//                                staleness (lib/cron-tracking.ts)
//   4. KNOWN_CRON_JOBS           the ?job= variants a dispatching route accepts
//
// A name in (1) missing from (2) never runs. A name in (1) missing from (3)
// runs unwatched, so a later scheduler lapse goes unnoticed. Both fail here.
//
// (4) was added after the same failure recurred a third time, one level down:
// social-refresh WAS scheduled and WAS tracked, so every check above passed —
// while five of its eight ?job= variants had never been entered into the
// crontab, leaving viral/AI/health scores permanently NULL and goals never
// evaluated. Matching on route name alone cannot see that.
//
// Run: node scripts/check-cron-coverage.mjs   (wired into `npm run lint`)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const routes = readdirSync(join(ROOT, "app/api/cron"))
  .filter((name) => statSync(join(ROOT, "app/api/cron", name)).isDirectory())
  .sort();

const crontab = readFileSync(join(ROOT, "ops/crontab"), "utf8");
// Only real schedule lines count — a name that appears solely in a comment is
// exactly the "documented but not scheduled" state this check exists to catch.
const scheduleLines = crontab
  .split("\n")
  .filter((line) => line.trim() && !line.trimStart().startsWith("#"));

const scheduled = new Set(
  scheduleLines.flatMap((line) => [...line.matchAll(/\/api\/cron\/([a-z0-9-]+)/g)].map((m) => m[1])),
);

// "<route>:<job>" for every scheduled ?job= line. A route matched by name
// alone tells you nothing about its jobs — social-refresh was scheduled and
// looked healthy for months while five of its eight jobs had never run.
const scheduledJobs = new Set(
  scheduleLines.flatMap((line) =>
    [...line.matchAll(/\/api\/cron\/([a-z0-9-]+)\?job=([a-z0-9-]+)/g)].map((m) => `${m[1]}:${m[2]}`),
  ),
);

// Read the names as source text rather than importing lib/cron-tracking.ts,
// which pulls in redis/env and would make a lint check need a live config.
const tracking = readFileSync(join(ROOT, "lib/cron-tracking.ts"), "utf8");
const trackedBlock = tracking.match(/KNOWN_CRON_NAMES\s*=\s*\[([^\]]*)\]/s);
if (!trackedBlock) {
  console.error("✗ could not find KNOWN_CRON_NAMES in lib/cron-tracking.ts");
  process.exit(1);
}
const tracked = new Set([...trackedBlock[1].matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]));

// KNOWN_CRON_JOBS: the ?job= values each dispatching route accepts. Parsed the
// same way, and the same source of truth the route itself validates against.
// By convention the FIRST job listed is the route's default — it's the one a
// bare crontab line with no ?job= runs, so it isn't required to have its own.
const jobsBlock = tracking.match(/KNOWN_CRON_JOBS\s*=\s*\{(.*?)\n\}\s*as const;/s);
const declaredJobs = new Map();
if (jobsBlock) {
  for (const entry of jobsBlock[1].matchAll(/"([a-z0-9-]+)"\s*:\s*\[([^\]]*)\]/g)) {
    declaredJobs.set(entry[1], [...entry[2].matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]));
  }
}

const problems = [];

for (const [route, jobs] of declaredJobs) {
  if (!routes.includes(route)) {
    problems.push(`${route}: declared in KNOWN_CRON_JOBS but app/api/cron/${route} doesn't exist.`);
    continue;
  }
  const [defaultJob, ...rest] = jobs;
  if (!scheduled.has(route)) {
    problems.push(
      `${route}:${defaultJob}: the default job needs a bare crontab line (no ?job=), and there isn't one.`,
    );
  }
  for (const job of rest) {
    if (!scheduledJobs.has(`${route}:${job}`)) {
      problems.push(
        `${route}:${job}: the route accepts ?job=${job} but nothing in ops/crontab calls it — it will never run.\n` +
          `    Add a schedule line, or drop the job from KNOWN_CRON_JOBS and from the route.`,
      );
    }
  }
}

for (const id of scheduledJobs) {
  const [route, job] = id.split(":");
  const jobs = declaredJobs.get(route);
  if (!jobs) {
    problems.push(`${id}: ops/crontab passes ?job= to ${route}, which declares no jobs in KNOWN_CRON_JOBS.`);
  } else if (!jobs.includes(job)) {
    problems.push(`${id}: scheduled, but "${job}" is not one of ${route}'s declared jobs — production is getting a 400.`);
  }
}

for (const name of routes) {
  if (!scheduled.has(name)) {
    problems.push(
      `${name}: app/api/cron/${name} exists but nothing in ops/crontab calls it — it will never run.\n` +
        `    Add a schedule line, or delete the route if it's genuinely on-demand only.`,
    );
  }
  if (!tracked.has(name)) {
    problems.push(
      `${name}: missing from KNOWN_CRON_NAMES in lib/cron-tracking.ts — it would run unwatched,\n` +
        `    so /admin/ops/diagnostics could never tell you it had stopped. Add it there and give it\n` +
        `    a budget in CRON_STALE_AFTER_SEC (lib/admin/metrics.ts).`,
    );
  }
}

for (const name of tracked) {
  if (!routes.includes(name)) {
    problems.push(`${name}: in KNOWN_CRON_NAMES but app/api/cron/${name} doesn't exist — stale entry, remove it.`);
  }
}

for (const name of scheduled) {
  if (!routes.includes(name)) {
    problems.push(`${name}: scheduled in ops/crontab but app/api/cron/${name} doesn't exist — production is curling a 404.`);
  }
}

if (problems.length > 0) {
  console.error("✗ cron coverage:\n");
  for (const p of problems) console.error(`  ${p}\n`);
  process.exit(1);
}

const jobCount = [...declaredJobs.values()].reduce((n, j) => n + j.length, 0);
console.log(
  `✓ cron coverage — ${routes.length} routes (${jobCount} ?job= variants), all scheduled in ops/crontab and watched for staleness`,
);
