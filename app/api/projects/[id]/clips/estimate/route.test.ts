import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The estimate route exists so the price shown in Review and the price charged
// by Confirm cannot disagree. It priced windows Confirm would reject, and an
// inverted window contributed a negative duration — quoting LESS than the real
// cost (0 credits, in the case below) for a selection that then 400s.

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "user-1", email: "user-1@test.com" })),
}));

vi.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: (handler: unknown) => handler,
}));

vi.mock("@/lib/credits", () => ({
  getBalances: vi.fn(async () => ({ total: 100, subscription: 0, purchased: 100, bonus: 0 })),
}));

// Mocked wholesale (as the confirm route test does) so the route under test
// doesn't drag in S3/env at import time. The arithmetic mirrors the real
// computeCreditCost with the default pricing.
vi.mock("@/lib/autoclip-pipeline", () => ({
  computeCreditCost: vi.fn((clipCount: number, totalDurationSec: number) =>
    clipCount + Math.ceil(totalDurationSec / 120)),
  getAutoClipPricing: vi.fn(async () => ({ perClip: 1, perTwoMinutes: 1, analysisPerHalfHour: 1, rerender: 1 })),
  getAnalysisCreditsPaid: vi.fn(async () => 0),
}));

const CLIPS = [
  { id: "clip-1", startSec: 0, endSec: 60 },
  { id: "clip-2", startSec: 60, endSec: 120 },
];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: vi.fn(async () => ({ id: "project-1" })) },
    clip: { findMany: vi.fn(async () => CLIPS) },
    config: { findUnique: vi.fn(async () => null) },
    creditTransaction: { findMany: vi.fn(async () => []) },
  },
}));

const { POST } = await import("./route");

function req(body: unknown) {
  return new NextRequest("http://localhost/api/projects/project-1/clips/estimate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ id: "project-1" });

describe("auto-clip cost estimate", () => {
  it("prices a valid selection", async () => {
    const res = await POST(req({ clips: CLIPS.map((c) => ({ id: c.id, keep: true })) }), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clipCount).toBe(2);
    expect(body.totalDurationSec).toBe(120);
    // 2 clips x perClip(1) + ceil(120/120) x perTwoMinutes(1)
    expect(body.total).toBe(3);
  });

  it("rejects an inverted window instead of quoting a negative duration", async () => {
    const res = await POST(
      req({ clips: [{ id: "clip-1", keep: true, startSec: 50, endSec: 10 }] }),
      { params },
    );
    expect(res.status).toBe(400);
  });

  it("ignores the window of a clip that is being dropped", async () => {
    const res = await POST(
      req({
        clips: [
          { id: "clip-1", keep: true },
          { id: "clip-2", keep: false, startSec: 90, endSec: 5 },
        ],
      }),
      { params },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).clipCount).toBe(1);
  });
});
