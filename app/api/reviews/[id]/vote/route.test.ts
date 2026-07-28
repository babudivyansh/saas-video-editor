import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 10 })),
  getClientIp: vi.fn(() => "1.2.3.4"),
}));

let authUser: { userId: string; email: string; sessionId: string } | null = null;
vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => authUser),
  getApiKeyAuth: vi.fn(async () => null),
}));

let review: { id: string; userId: string; status: string } | null;
let existingVote: { id: string; value: number } | null;
let reviewCounters: { helpfulCount: number; notHelpfulCount: number };
const voteCreate = vi.fn();
const voteUpdate = vi.fn();
const voteDelete = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: {
      findFirst: vi.fn(async () => review),
      findUnique: vi.fn(async () => reviewCounters),
      update: vi.fn(async ({ data }: { data: Record<string, { increment?: number; decrement?: number }> }) => {
        if (data.helpfulCount?.increment) reviewCounters.helpfulCount += data.helpfulCount.increment;
        if (data.helpfulCount?.decrement) reviewCounters.helpfulCount -= data.helpfulCount.decrement;
        if (data.notHelpfulCount?.increment) reviewCounters.notHelpfulCount += data.notHelpfulCount.increment;
        if (data.notHelpfulCount?.decrement) reviewCounters.notHelpfulCount -= data.notHelpfulCount.decrement;
        return reviewCounters;
      }),
    },
    reviewHelpfulVote: {
      findUnique: vi.fn(async () => existingVote),
      create: (...args: unknown[]) => voteCreate(...args),
      update: (...args: unknown[]) => voteUpdate(...args),
      delete: (...args: unknown[]) => voteDelete(...args),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        reviewHelpfulVote: {
          update: (...args: unknown[]) => voteUpdate(...args),
          create: (...args: unknown[]) => voteCreate(...args),
          delete: (...args: unknown[]) => voteDelete(...args),
        },
        review: {
          update: vi.fn(async ({ data }: { data: Record<string, { increment?: number; decrement?: number }> }) => {
            if (data.helpfulCount?.increment) reviewCounters.helpfulCount += data.helpfulCount.increment;
            if (data.helpfulCount?.decrement) reviewCounters.helpfulCount -= data.helpfulCount.decrement;
            if (data.notHelpfulCount?.increment) reviewCounters.notHelpfulCount += data.notHelpfulCount.increment;
            if (data.notHelpfulCount?.decrement) reviewCounters.notHelpfulCount -= data.notHelpfulCount.decrement;
            return reviewCounters;
          }),
        },
      }),
    ),
  },
}));

const { POST, DELETE } = await import("./route");

function post(id: string, body: unknown) {
  return POST(
    new NextRequest(`http://localhost/api/reviews/${id}/vote`, { method: "POST", body: JSON.stringify(body), headers: { Authorization: "Bearer tok" } }),
    { params: Promise.resolve({ id }) },
  );
}
function del(id: string) {
  return DELETE(
    new NextRequest(`http://localhost/api/reviews/${id}/vote`, { method: "DELETE", headers: { Authorization: "Bearer tok" } }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authUser = { userId: "u1", email: "u1@test.com", sessionId: "s1" };
  review = { id: "rev-1", userId: "author-1", status: "published" };
  existingVote = null;
  reviewCounters = { helpfulCount: 0, notHelpfulCount: 0 };
});

describe("POST /api/reviews/[id]/vote", () => {
  it("401s when unauthenticated", async () => {
    authUser = null;
    const res = await post("rev-1", { value: 1 });
    expect(res.status).toBe(401);
  });

  it("400s on an invalid value", async () => {
    const res = await post("rev-1", { value: 2 });
    expect(res.status).toBe(400);
  });

  it("404s on a non-published review", async () => {
    review = null;
    const res = await post("rev-1", { value: 1 });
    expect(res.status).toBe(404);
  });

  it("403s a self-vote", async () => {
    review = { id: "rev-1", userId: "u1", status: "published" };
    const res = await post("rev-1", { value: 1 });
    expect(res.status).toBe(403);
  });

  it("creates a new helpful vote and increments the counter", async () => {
    const res = await post("rev-1", { value: 1 });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.myVote).toBe(1);
    expect(data.helpfulCount).toBe(1);
    expect(voteCreate).toHaveBeenCalled();
  });

  it("is idempotent when voting the same way twice", async () => {
    existingVote = { id: "vote-1", value: 1 };
    reviewCounters = { helpfulCount: 1, notHelpfulCount: 0 };
    const res = await post("rev-1", { value: 1 });
    const data = await res.json();
    expect(data.helpfulCount).toBe(1);
    expect(voteUpdate).not.toHaveBeenCalled();
  });

  it("flips a vote from helpful to not-helpful, adjusting both counters", async () => {
    existingVote = { id: "vote-1", value: 1 };
    reviewCounters = { helpfulCount: 1, notHelpfulCount: 0 };
    const res = await post("rev-1", { value: -1 });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.helpfulCount).toBe(0);
    expect(data.notHelpfulCount).toBe(1);
    expect(voteUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { value: -1 } }));
  });
});

describe("DELETE /api/reviews/[id]/vote", () => {
  it("404s when no vote exists", async () => {
    const res = await del("rev-1");
    expect(res.status).toBe(404);
  });

  it("removes the vote and decrements the counter", async () => {
    existingVote = { id: "vote-1", value: 1 };
    reviewCounters = { helpfulCount: 1, notHelpfulCount: 0 };
    const res = await del("rev-1");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.myVote).toBeNull();
    expect(data.helpfulCount).toBe(0);
    expect(voteDelete).toHaveBeenCalled();
  });
});
