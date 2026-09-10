import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({ env: { SOCIAL_REFRESH_SECRET: "test-secret" } }));

const refreshStaleAccounts = vi.fn(async () => ({ refreshed: 1 }));
const pruneTimeSeries = vi.fn(async () => ({ snapshots: 3 }));
const sendWeeklyDigests = vi.fn(async () => ({ sent: 2 }));
vi.mock("@/lib/social/service", () => ({
  refreshStaleAccounts: () => refreshStaleAccounts(),
  pruneTimeSeries: () => pruneTimeSeries(),
  sendWeeklyDigests: () => sendWeeklyDigests(),
}));

const refreshStaleCompetitors = vi.fn(async () => ({ refreshed: 0 }));
vi.mock("@/lib/social/competitors", () => ({ refreshStaleCompetitors: () => refreshStaleCompetitors() }));

const evaluateGoals = vi.fn(async () => ({ hit: 1, missed: 0 }));
const recomputeScores = vi.fn(async () => ({ posts: 10, accounts: 2 }));
const runScheduledReports = vi.fn(async () => ({ queued: 0 }));
const syncDailyMetrics = vi.fn(async () => ({ filled: 5 }));
vi.mock("@/lib/social/jobs", () => ({
  evaluateGoals: () => evaluateGoals(),
  recomputeScores: () => recomputeScores(),
  runScheduledReports: () => runScheduledReports(),
  syncDailyMetrics: () => syncDailyMetrics(),
}));

const refreshClipPublishMetrics = vi.fn(async () => ({ updated: 0 }));
vi.mock("@/lib/autoclip-publish", () => ({ refreshClipPublishMetrics: () => refreshClipPublishMetrics() }));

const recalibrateViralityWeights = vi.fn(async () => ({ recalibrated: false }));
vi.mock("@/lib/virality-calibration", () => ({ recalibrateViralityWeights: () => recalibrateViralityWeights() }));

const recordCronRun = vi.fn(async () => {});
vi.mock("@/lib/cron-tracking", async (orig) => ({
  ...(await orig<typeof import("@/lib/cron-tracking")>()),
  recordCronRun: (...a: unknown[]) => recordCronRun(...a),
}));

const { GET } = await import("./route");

// `null` means "send no Authorization header" — an explicit `undefined` would
// pick up the default value instead, which is not the same test.
const run = (job?: string, authz: string | null = "Bearer test-secret") =>
  GET(
    new NextRequest(`http://localhost/api/cron/social-refresh${job ? `?job=${job}` : ""}`, {
      headers: authz ? { authorization: authz } : {},
    }),
  );

// The route records its run through a fire-and-forget dynamic import
// (`void import(...).then(...)`), so the call lands a microtask after the
// response resolves.
const settle = () => new Promise((r) => setTimeout(r, 0));

// Every job's worker, keyed by the ?job= value that should reach it.
const WORKERS = {
  retention: pruneTimeSeries,
  digest: sendWeeklyDigests,
  "recalibrate-virality": recalibrateViralityWeights,
  "daily-metrics": syncDailyMetrics,
  scores: recomputeScores,
  reports: runScheduledReports,
  goals: evaluateGoals,
} as const;

beforeEach(() => vi.clearAllMocks());

describe("GET /api/cron/social-refresh", () => {
  it("rejects a missing secret", async () => {
    expect((await run(undefined, null)).status).toBe(401);
    expect(recordCronRun).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    expect((await run(undefined, "Bearer wrong")).status).toBe(401);
    expect(refreshStaleAccounts).not.toHaveBeenCalled();
  });

  it.each(Object.entries(WORKERS))("dispatches ?job=%s to its own worker only", async (job, worker) => {
    const res = await run(job);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, job });
    expect(worker).toHaveBeenCalledTimes(1);
    for (const [otherJob, other] of Object.entries(WORKERS)) {
      if (otherJob !== job) expect(other).not.toHaveBeenCalled();
    }
    expect(refreshStaleAccounts).not.toHaveBeenCalled();
  });

  it("defaults to the refresh job", async () => {
    const res = await run();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, job: "refresh" });
    expect(refreshStaleAccounts).toHaveBeenCalledTimes(1);
  });

  // The whole point of the per-job split: a heartbeat recorded for the route
  // as a whole let the hourly refresh vouch for jobs that had never run.
  it.each(["refresh", "scores", "goals", "reports", "daily-metrics"])(
    "records the run under its own job key (%s)",
    async (job) => {
      await run(job === "refresh" ? undefined : job);
      await settle();
      expect(recordCronRun).toHaveBeenCalledWith("social-refresh", job);
    },
  );

  it("rejects an unknown job without recording a run for it", async () => {
    const res = await run("not-a-job");
    await settle();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'unknown job "not-a-job"' });
    expect(recordCronRun).not.toHaveBeenCalled();
    for (const worker of Object.values(WORKERS)) expect(worker).not.toHaveBeenCalled();
    expect(refreshStaleAccounts).not.toHaveBeenCalled();
  });
});
