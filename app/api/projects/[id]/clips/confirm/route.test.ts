import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Regression guard mirroring app/api/generate/compile/route.test.ts's H6
// double-submit test: two concurrent confirms for the same project must not
// both charge credits and both enqueue a render.

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "user-1", email: "user-1@test.com" })),
}));

vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}) },
}));

const enqueue = vi.fn();
vi.mock("@/lib/render-queue", () => ({
  createRenderQueue: vi.fn(() => ({ enqueue, driver: "in-process" })),
}));

vi.mock("@/lib/autoclip-pipeline", () => ({
  renderJob: vi.fn(async () => {}),
  computeCreditCost: vi.fn((clipCount: number) => clipCount), // 1 credit/clip, deterministic for the test
  getAutoClipPricing: vi.fn(async () => ({ base: 1, perExtraClip: 1, perMinute: 1, rerender: 1 })),
}));

let credits = 10;
let projectStatus = "pending_review";
const CLIPS = [
  { id: "clip-1", projectId: "project-1", index: 0, startSec: 0, endSec: 10, durationSec: 10, aspectRatio: "9:16", status: "pending_review" },
  { id: "clip-2", projectId: "project-1", index: 1, startSec: 10, endSec: 20, durationSec: 10, aspectRatio: "9:16", status: "pending_review" },
];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(async () => ({ id: "project-1", userId: "user-1", status: projectStatus })),
      // Mirrors real Prisma: only affects rows matching `where`, so it's the
      // atomic guard — two concurrent calls against the same row can't both
      // see it as still "pending_review".
      updateMany: vi.fn(async (args: { where: { status?: string }; data: { status: string } }) => {
        if (projectStatus === args.where.status) {
          projectStatus = args.data.status;
          return { count: 1 };
        }
        return { count: 0 };
      }),
      update: vi.fn(async (args: { data: { status: string } }) => {
        projectStatus = args.data.status;
      }),
    },
    clip: {
      findMany: vi.fn(async () => CLIPS.filter((c) => c.status === "pending_review")),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: unknown }) => ({ id: where.id, ...(data as object) })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    user: {
      update: vi.fn(async () => {
        credits -= 1; // matches the mocked computeCreditCost returning clipCount=2, but we assert via enqueue/status instead
        return { credits };
      }),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

const { POST } = await import("./route");

function makeRequest() {
  return new NextRequest("http://localhost/api/projects/project-1/clips/confirm", {
    method: "POST",
    body: JSON.stringify({ clips: [{ id: "clip-1", keep: true }, { id: "clip-2", keep: true }] }),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/projects/[id]/clips/confirm — double submit", () => {
  beforeEach(() => {
    credits = 10;
    projectStatus = "pending_review";
    enqueue.mockClear();
  });
  afterEach(() => vi.clearAllMocks());

  it("charges credits and enqueues exactly once even when confirmed twice concurrently", async () => {
    const params = Promise.resolve({ id: "project-1" });
    const [first, second] = await Promise.all([
      POST(makeRequest(), { params }),
      POST(makeRequest(), { params }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(credits).toBe(9); // decremented exactly once, not twice
  });
});
