// dispatchCronJob — how every scheduled and manual job run reaches its route.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse, type NextRequest } from "next/server";

const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
const redisSets = new Map<string, string>();
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://clipiro.test" } }));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/redis", () => ({
  redis: { set: vi.fn(async (k: string, v: string) => { redisSets.set(k, v); }) },
}));

// A job route built the way the real ones are: checks its secret, then runs,
// wrapped in the real withCronTracking.
const work = vi.fn(async (_req: NextRequest): Promise<Response> => NextResponse.json({ ok: true }));
vi.mock("@/lib/cron-routes", async () => {
  const { KNOWN_CRON_NAMES, withCronTracking } = await import("@/lib/cron-tracking");
  const { cronSecretMatches } = await import("@/lib/cron-auth");
  return {
    CRON_ROUTES: Object.fromEntries(KNOWN_CRON_NAMES.map((name) => [name, async () => ({
      GET: withCronTracking(name, async (req: NextRequest) =>
        cronSecretMatches(req, "right") ? work(req) : NextResponse.json({ error: "Unauthorized" }, { status: 401 })),
    })])),
  };
});

const { dispatchCronJob, cronRouteName } = await import("./cron-dispatch");
const { CRON_SCHEDULE } = await import("./cron-schedule");

const entry = { schedule: "*/2 * * * *", path: "/api/cron/dub-sweep", secret: "CRON_SECRET" } as const;
const jobbed = { schedule: "0 3 * * *", path: "/api/cron/social-refresh?job=scores", secret: "SOCIAL_REFRESH_SECRET" } as const;

beforeEach(() => {
  work.mockClear();
  logger.error.mockClear();
  logger.warn.mockClear();
  redisSets.clear();
});

describe("dispatchCronJob", () => {
  // The loopback self-call got ECONNREFUSED on Hostinger (Sentry
  // CLIPIRO-WEB-4); jobs must not depend on any listen address.
  it("runs the job's own route handler in-process, without any network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await dispatchCronJob(entry, "right");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(work).toHaveBeenCalledTimes(1);
    const req = work.mock.calls[0][0];
    expect(req.nextUrl.pathname).toBe("/api/cron/dub-sweep");
    expect(req.headers.get("x-cron-secret")).toBe("right");
    expect(req.headers.get("authorization")).toBe("Bearer right");
  });

  it("records a successful run in cron tracking", async () => {
    await dispatchCronJob(entry, "right");
    expect(redisSets.has("cron:lastok:dub-sweep")).toBe(true);
    expect(redisSets.has("cron:lastfail:dub-sweep")).toBe(false);
  });

  it("passes ?job= through, so per-job routes track the right job", async () => {
    await dispatchCronJob(jobbed, "right");
    expect(work.mock.calls[0][0].nextUrl.searchParams.get("job")).toBe("scores");
    expect(redisSets.has("cron:lastok:social-refresh:scores")).toBe(true);
  });

  it("still goes through the route's own auth: a wrong secret runs nothing and records nothing", async () => {
    await dispatchCronJob(entry, "wrong");
    expect(work).not.toHaveBeenCalled();
    expect(redisSets.size).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith("cron-dispatch", "/api/cron/dub-sweep answered 401");
  });

  it("records a throwing job as failed and logs it instead of throwing", async () => {
    work.mockRejectedValueOnce(new Error("db down"));
    await expect(dispatchCronJob(entry, "right")).resolves.toBeUndefined();
    expect(JSON.parse(redisSets.get("cron:lastfail:dub-sweep") ?? "{}").error).toBe("db down");
    expect(logger.error).toHaveBeenCalledWith("cron-dispatch", "/api/cron/dub-sweep failed", expect.any(Error));
  });

  it("refuses a path that isn't a cron route", async () => {
    await dispatchCronJob({ ...entry, path: "/api/admin/users" }, "right");
    expect(work).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith("cron-dispatch", "/api/admin/users is not a known cron route");
  });
});

describe("cronRouteName", () => {
  it("resolves every scheduled path to a registered route", () => {
    for (const e of CRON_SCHEDULE) expect(cronRouteName(e.path), e.path).not.toBeNull();
  });

  it("rejects lookalikes and prototype keys", () => {
    for (const p of ["/api/cron/nope", "/api/cron/dub-sweep/x", "/api/cronx/dub-sweep", "/api/cron/constructor", "/api/cron/__proto__"]) {
      expect(cronRouteName(p), p).toBeNull();
    }
  });
});
