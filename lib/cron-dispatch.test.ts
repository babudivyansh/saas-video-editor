// dispatchCronJob — the self-call every scheduled and manual job run goes through.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/redis", () => ({ redis: {} }));

const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
const { dispatchCronJob, selfOrigin } = await import("./cron-dispatch");

const entry = { schedule: "*/2 * * * *", path: "/api/cron/dub-sweep", secret: "CRON_SECRET" } as const;

beforeEach(() => {
  fetchMock.mockClear();
  logger.error.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("dispatchCronJob", () => {
  // Behind Hostinger's proxy the request origin is not callable from Node;
  // using it made every job fail with "fetch failed" (2026-10-25 prod logs).
  it("calls the job over loopback on the app's own port", async () => {
    vi.stubEnv("PORT", "4123");
    await dispatchCronJob(entry, "s");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4123/api/cron/dub-sweep",
      expect.objectContaining({ headers: { Authorization: "Bearer s", "X-Cron-Secret": "s" } }),
    );
  });

  it("falls back to port 3000 when PORT is unset", () => {
    vi.stubEnv("PORT", "");
    expect(selfOrigin()).toBe("http://127.0.0.1:3000");
  });

  it("logs the failure instead of throwing", async () => {
    const err = new TypeError("fetch failed", { cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) });
    fetchMock.mockRejectedValueOnce(err);
    await expect(dispatchCronJob(entry, "s")).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith("cron-dispatch", "/api/cron/dub-sweep could not be called", err);
  });
});
