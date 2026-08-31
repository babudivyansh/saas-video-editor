import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Only the route wiring is under test — mock withAdmin so importing the route
// doesn't pull in the full auth/elevation chain, same approach used by the
// sibling app/api/admin/s3-access-logging/route.test.ts.
vi.mock("@/lib/admin/api", () => ({
  withAdmin: (handler: (req: NextRequest, ctx: { admin: { userId: string } }) => unknown) =>
    (req: NextRequest) => handler(req, { admin: { userId: "admin1" } }),
}));

const runDubSweep = vi.fn(async () => ({ ok: true as const, checked: 3, enqueued: 2, failed: 1, at: "2026-01-01T00:00:00.000Z" }));
vi.mock("@/lib/cron/dub-sweep", () => ({ runDubSweep: (...a: unknown[]) => runDubSweep(...a) }));

const auditCalls: unknown[] = [];
vi.mock("@/lib/admin/audit", () => ({
  auditAdminAction: vi.fn(async (...a: unknown[]) => {
    auditCalls.push(a);
  }),
  auditIp: vi.fn(() => "127.0.0.1"),
}));

const { POST } = await import("./route");

describe("POST /api/admin/ops/run-dub-sweep", () => {
  it("runs the sweep, returns its result, and audit-logs the action", async () => {
    const res = await POST(new NextRequest("http://localhost/api/admin/ops/run-dub-sweep", { method: "POST" }));
    const body = await res.json();
    expect(body).toEqual({ ok: true, checked: 3, enqueued: 2, failed: 1, at: "2026-01-01T00:00:00.000Z" });
    expect(runDubSweep).toHaveBeenCalledTimes(1);
    expect(auditCalls).toEqual([
      ["admin1", "clip.dub_sweep_run", undefined, { after: body, ip: "127.0.0.1" }],
    ]);
  });
});
