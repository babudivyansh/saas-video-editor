import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const store = new Map<string, string>();
const setCalls: Array<{ key: string; value: string; ex: number }> = [];

vi.mock("@/lib/redis", () => ({
  redis: {
    set: vi.fn(async (k: string, v: string, _mode: string, ex: number) => {
      store.set(k, v);
      setCalls.push({ key: k, value: v, ex });
    }),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
  },
}));

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const { recordCronRun, getCronRunStatuses, withCronTracking, KNOWN_CRON_RUN_IDS, KNOWN_CRON_JOBS } = await import("./cron-tracking");

beforeEach(() => {
  store.clear();
  setCalls.length = 0;
  vi.clearAllMocks();
});

describe("cron-tracking", () => {
  it("records a run with an ISO timestamp under a fortnight TTL", async () => {
    await recordCronRun("refill-credits");
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].key).toBe("cron:lastrun:refill-credits");
    expect(() => new Date(setCalls[0].value).toISOString()).not.toThrow();
    expect(setCalls[0].ex).toBe(14 * 24 * 60 * 60);
  });

  it("reports every known cron, with age for those that have run and null for those that haven't", async () => {
    await recordCronRun("refill-credits");
    const statuses = await getCronRunStatuses();

    expect(statuses).toHaveLength(KNOWN_CRON_RUN_IDS.length);

    const ran = statuses.find((s) => s.name === "refill-credits")!;
    expect(ran.lastRunAt).not.toBeNull();
    expect(ran.ageSeconds).toBeGreaterThanOrEqual(0);
    expect(ran.ageSeconds).toBeLessThan(5);

    const neverRan = statuses.find((s) => s.name === "account-purge")!;
    expect(neverRan.lastRunAt).toBeNull();
    expect(neverRan.ageSeconds).toBeNull();
  });

  // The regression that hid five never-scheduled jobs for months: a ?job=
  // route recorded one heartbeat for the whole route, so its busiest job
  // vouched for every other one.
  it("keys a ?job= run separately from its route's other jobs", async () => {
    await recordCronRun("social-refresh", "scores");
    expect(setCalls[0].key).toBe("cron:lastrun:social-refresh:scores");

    const statuses = await getCronRunStatuses();
    expect(statuses.find((s) => s.name === "social-refresh:scores")!.lastRunAt).not.toBeNull();
    for (const other of ["social-refresh:refresh", "social-refresh:goals", "social-refresh:reports"] as const) {
      expect(statuses.find((s) => s.name === other)!.lastRunAt).toBeNull();
    }
  });

  it("tracks every declared job of a dispatching route, and no bare route entry for it", async () => {
    const ids = KNOWN_CRON_RUN_IDS as readonly string[];
    for (const job of KNOWN_CRON_JOBS["social-refresh"]) {
      expect(ids).toContain(`social-refresh:${job}`);
    }
    // A bare entry would be the false-green all over again.
    expect(ids).not.toContain("social-refresh");
    expect(ids).not.toContain("asset-cleanup");
  });
});

describe("withCronTracking — outcomes, not just hits", () => {
  const req = (url = "http://localhost/api/cron/x") => new NextRequest(url);
  const status = async (name: string) => (await getCronRunStatuses()).find((s) => s.name === name)!;

  it("records a success when the run finishes with 2xx", async () => {
    const GET = withCronTracking("refill-credits", async () => NextResponse.json({ ok: true }));
    await GET(req());
    const s = await status("refill-credits");
    expect(s.lastSuccessAt).not.toBeNull();
    expect(s.failing).toBe(false);
    expect(s.successAgeSeconds).toBeLessThan(5);
  });

  it("records a failure with its error when the handler throws — and still throws", async () => {
    const GET = withCronTracking("mrr-snapshot", async () => { throw new Error("db unreachable"); });
    await expect(GET(req())).rejects.toThrow("db unreachable");
    const s = await status("mrr-snapshot");
    expect(s.failing).toBe(true);
    expect(s.lastError).toBe("db unreachable");
    expect(s.lastSuccessAt).toBeNull();
    // It did run — just not successfully. The old code would have shown green.
    expect(s.lastRunAt).not.toBeNull();
  });

  it("records a failure for a 5xx, using the route's error message", async () => {
    const GET = withCronTracking("clip-publish", async () => NextResponse.json({ error: "Scheduled publish run failed" }, { status: 500 }));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Scheduled publish run failed" });
    expect((await status("clip-publish")).lastError).toBe("Scheduled publish run failed");
  });

  it("records nothing for a 4xx — a scanner with a bad secret can't fake a run", async () => {
    const GET = withCronTracking("account-purge", async () => NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    await GET(req());
    expect(setCalls).toHaveLength(0);
  });

  it("a later success clears the failing state", async () => {
    let fail = true;
    const GET = withCronTracking("onboarding", async () => {
      if (fail) throw new Error("smtp down");
      return NextResponse.json({ ok: true });
    });
    await GET(req()).catch(() => {});
    expect((await status("onboarding")).failing).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    fail = false;
    await GET(req());
    expect((await status("onboarding")).failing).toBe(false);
  });

  it("records a ?job= route under its job, defaulting to the first listed job", async () => {
    const GET = withCronTracking("asset-cleanup", async () => NextResponse.json({ ok: true }));
    await GET(req("http://localhost/api/cron/asset-cleanup?job=retention"));
    await GET(req("http://localhost/api/cron/asset-cleanup"));
    expect((await status("asset-cleanup:retention")).lastSuccessAt).not.toBeNull();
    expect((await status(`asset-cleanup:${KNOWN_CRON_JOBS["asset-cleanup"][0]}`)).lastSuccessAt).not.toBeNull();
  });

  it("records nothing for an unknown ?job=", async () => {
    const GET = withCronTracking("social-refresh", async () => NextResponse.json({ ok: true }));
    await GET(req("http://localhost/api/cron/social-refresh?job=not-a-job"));
    expect(setCalls).toHaveLength(0);
  });
});
