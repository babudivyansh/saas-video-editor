import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Regression guard for H6: none of the 6 render routes guard against a
// double-submit today — a double-click (or a client retry) reliably charges
// twice and enqueues the render twice. This test calls the real route handler
// twice with the same project and asserts a single charge/enqueue.

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "user-1", email: "user-1@test.com" })),
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
    del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

vi.mock("@/lib/quests", () => ({
  markQuestComplete: vi.fn(async () => {}),
}));

vi.mock("@/lib/credit-events", () => ({
  firePostCreditSpendEmails: vi.fn(),
  fireZeroCreditsEmail: vi.fn(),
}));

const enqueue = vi.fn();
vi.mock("@/lib/job-queue", () => ({
  getRenderQueue: vi.fn(() => ({ enqueue })),
}));

let credits = 5;
let projectStatus = "draft";
const projectUpdates: unknown[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(async () => ({ id: "project-1", userId: "user-1", status: projectStatus })),
      update: vi.fn(async (args: unknown) => {
        projectUpdates.push(args);
      }),
      // Mirrors real Prisma: `updateMany` only affects rows matching the
      // `where`, so it's the atomic guard — two concurrent calls against the
      // same row can't both see it as still "draft"/"failed".
      updateMany: vi.fn(async (args: { where: { status?: { in?: string[] } }; data: { status: string } }) => {
        if (args.where.status?.in?.includes(projectStatus)) {
          projectStatus = args.data.status;
          return { count: 1 };
        }
        return { count: 0 };
      }),
    },
    user: {
      update: vi.fn(async () => {
        credits -= 1;
        return { credits };
      }),
    },
  },
}));

const { POST } = await import("@/app/api/generate/compile/route");

function makeRequest() {
  return new NextRequest("http://localhost/api/generate/compile", {
    method: "POST",
    body: JSON.stringify({
      projectId: "project-1",
      bgVideoUrl: "https://example.com/bg.mp4",
      voiceAudioUrl: "https://example.com/voice.mp3",
      wordTimings: [],
      subtitlesStyle: {},
    }),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/generate/compile — double submit", () => {
  beforeEach(() => {
    credits = 5;
    projectStatus = "draft";
    projectUpdates.length = 0;
  });
  afterEach(() => vi.clearAllMocks());

  it("charges credits and enqueues exactly once even when the same project is submitted twice", async () => {
    const [first, second] = await Promise.all([POST(makeRequest()), POST(makeRequest())]);

    expect(first.status).toBe(200);
    // A guarded route rejects the second submit (409) instead of processing it.
    expect(second.status).toBe(409);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(credits).toBe(4); // charged once, not twice
  });
});
