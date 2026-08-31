import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "test-secret" } }));

const runDubSweep = vi.fn(async () => ({ ok: true as const, checked: 2, enqueued: 1, failed: 0, at: "2026-01-01T00:00:00.000Z" }));
vi.mock("@/lib/cron/dub-sweep", () => ({ runDubSweep: (...a: unknown[]) => runDubSweep(...a) }));

const recordCronRun = vi.fn(async () => {});
vi.mock("@/lib/cron-tracking", () => ({ recordCronRun: (...a: unknown[]) => recordCronRun(...a) }));

const { GET } = await import("./route");

const run = (authz?: string) =>
  GET(new NextRequest("http://localhost/api/cron/dub-sweep", { headers: authz ? { authorization: authz } : {} }));

describe("GET /api/cron/dub-sweep", () => {
  it("rejects a missing secret", async () => {
    const res = await run();
    expect(res.status).toBe(401);
    expect(runDubSweep).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const res = await run("Bearer wrong");
    expect(res.status).toBe(401);
    expect(runDubSweep).not.toHaveBeenCalled();
  });

  it("runs the sweep and returns its result on a valid secret", async () => {
    const res = await run("Bearer test-secret");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, checked: 2, enqueued: 1, failed: 0, at: "2026-01-01T00:00:00.000Z" });
    expect(runDubSweep).toHaveBeenCalledTimes(1);
  });
});
