// /api/cron-tick — the per-minute scheduler for hosts without cron.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const claims = new Set<string>();
const env: Record<string, string | undefined> = {
  CRON_SECRET: "cron-s",
  SOCIAL_REFRESH_SECRET: "social-s",
  ASSET_CLEANUP_SECRET: "asset-s",
};

vi.mock("@/lib/env", () => ({ env }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/redis", () => ({
  redis: {
    setNx: vi.fn(async (k: string) => (claims.has(k) ? false : (claims.add(k), true))),
    set: vi.fn(async () => {}),
  },
}));
// Run after() callbacks inline so the dispatched fetches are observable.
const pending: Promise<unknown>[] = [];
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => Promise<unknown>) => { pending.push(fn()); },
}));

const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
const { GET } = await import("./route");

const tick = (authz: string | null = "Bearer cron-s") =>
  GET(new NextRequest("https://clipiro.test/api/cron-tick", { headers: authz ? { authorization: authz } : {} }));
const called = () => fetchMock.mock.calls.map((c) => {
  const [url, init] = c as unknown as [string, RequestInit];
  return { path: url.replace("https://clipiro.test", ""), auth: (init.headers as Record<string, string>).Authorization };
});

beforeEach(() => {
  claims.clear();
  pending.length = 0;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  env.ASSET_CLEANUP_SECRET = "asset-s";
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function tickAt(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${iso}:20Z`));
  const res = await tick();
  await Promise.all(pending);
  return res;
}

describe("GET /api/cron-tick", () => {
  it("rejects a missing or wrong secret and runs nothing", async () => {
    expect((await tick(null)).status).toBe(401);
    expect((await tick("Bearer nope")).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runs exactly the jobs due this minute, each with its own route's secret", async () => {
    const res = await tickAt("2026-09-30T03:00");
    expect(res.status).toBe(200);
    const paths = called().map((c) => c.path).sort();
    expect(paths).toEqual([
      "/api/cron/asset-cleanup",
      "/api/cron/clip-publish",
      "/api/cron/dub-sweep",
      "/api/cron/refill-credits",
      "/api/cron/social-refresh",
      "/api/cron/social-refresh?job=scores",
      "/api/cron/stale-clip-sweep",
      "/api/cron/submagic-sweep",
    ]);
    const auth = Object.fromEntries(called().map((c) => [c.path, c.auth]));
    expect(auth["/api/cron/refill-credits"]).toBe("Bearer cron-s");
    expect(auth["/api/cron/social-refresh"]).toBe("Bearer social-s");
    expect(auth["/api/cron/asset-cleanup"]).toBe("Bearer asset-s");
  });

  it("never runs a job twice for the same slot (duplicate or retried tick)", async () => {
    await tickAt("2026-09-30T03:00");
    const first = fetchMock.mock.calls.length;
    fetchMock.mockClear();
    await tickAt("2026-09-30T03:00");
    expect(first).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("catches up a daily job whose minute the scheduler skipped", async () => {
    // Nothing called at 03:00; the next tick lands at 03:03.
    await tickAt("2026-09-30T03:03");
    expect(called().map((c) => c.path)).toContain("/api/cron/refill-credits");
  });

  it("collapses several missed runs of a frequent job into one call", async () => {
    await tickAt("2026-09-30T10:05"); // window 10:01–10:05: dub-sweep was due at :02 and :04
    expect(called().filter((c) => c.path === "/api/cron/dub-sweep")).toHaveLength(1);
  });

  it("skips (and reports) a job whose secret isn't configured instead of sending an empty bearer", async () => {
    env.ASSET_CLEANUP_SECRET = undefined;
    const res = await tickAt("2026-09-30T10:15");
    const body = await res.json();
    expect(body.missingSecret).toContain("/api/cron/asset-cleanup");
    expect(called().map((c) => c.path)).not.toContain("/api/cron/asset-cleanup");
    expect(called().map((c) => c.path)).toContain("/api/cron/stale-clip-sweep");
  });
});
