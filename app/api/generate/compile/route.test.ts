import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Regression guard for H6: none of the 6 render routes guard against a
// double-submit today — a double-click (or a client retry) reliably charges
// twice and enqueues the render twice. This test calls the real route handler
// twice with the same project and asserts a single charge/enqueue.
//
// EXPECTED TO FAIL until Branch 2 (H6) adds an atomic status guard to this
// route — that's intentional, written ahead of the fix per the agreed
// "tests first" sequencing.

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
const projectUpdates: unknown[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(async () => ({ id: "project-1", userId: "user-1", status: "draft" })),
      update: vi.fn(async (args: unknown) => {
        projectUpdates.push(args);
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
    projectUpdates.length = 0;
  });
  afterEach(() => vi.clearAllMocks());

  // it.fails: this assertion is expected to fail until Branch 2 (H6) lands.
  // Once the guard is added, remove `.fails` so this becomes a real
  // regression test instead of a forward-reference placeholder.
  it.fails("charges credits and enqueues exactly once even when the same project is submitted twice", async () => {
    const [first, second] = await Promise.all([POST(makeRequest()), POST(makeRequest())]);

    expect(first.status).toBe(200);
    // A guarded route rejects the second submit (409) instead of processing it.
    expect(second.status).toBe(409);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(credits).toBe(4); // charged once, not twice
  });
});
