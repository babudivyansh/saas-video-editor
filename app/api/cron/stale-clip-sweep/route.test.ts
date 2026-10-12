import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "s3cret" } }));
vi.mock("@/lib/cron-tracking", () => ({ withCronTracking: (_n: string, h: unknown) => h }));
const runStaleClipSweep = vi.fn(async () => ({ clips: 1 }));
vi.mock("@/lib/cron/stale-clip-sweep", () => ({ runStaleClipSweep }));
const reconcileOrphanedToolJobs = vi.fn(async () => 2);
vi.mock("@/lib/reconcile-tool-jobs", () => ({ reconcileOrphanedToolJobs }));

const { GET } = await import("./route");

describe("stale-clip-sweep", () => {
  it("also fails and refunds AI tool jobs a restart orphaned, not just at boot", async () => {
    const res = await GET(new NextRequest("http://localhost/api/cron/stale-clip-sweep", { headers: { authorization: "Bearer s3cret" } }));
    expect(await res.json()).toEqual({ clips: 1, toolJobsReconciled: 2 });
  });

  it("needs the cron secret", async () => {
    reconcileOrphanedToolJobs.mockClear();
    expect((await GET(new NextRequest("http://localhost/api/cron/stale-clip-sweep"))).status).toBe(401);
    expect(reconcileOrphanedToolJobs).not.toHaveBeenCalled();
  });
});
