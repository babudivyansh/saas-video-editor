import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// The posts routes are thin: the paid gate, the body check, and PostError as
// the mobile error. What they do is lib/mobile/posts.ts (posts.test.ts).

const h = vi.hoisted(() => ({ subscriber: { value: true as boolean }, createPosts: vi.fn(), retryPost: vi.fn(), webCaptions: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "u1", email: "m@x.co", sessionId: "s1" })),
  requireSubscriber: vi.fn(async () => (h.subscriber.value ? { userId: "u1" } : null)),
  convertToMobileSession: vi.fn(),
  verifyToken: vi.fn(),
}));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/mobile/posts", async () => {
  class PostError extends Error {
    constructor(public status: number, message: string, public code?: string) { super(message); }
  }
  const { mobileError } = await import("@/lib/mobile/http");
  return {
    PostError,
    postErrorResponse: (e: unknown) => {
      if (e instanceof PostError) return mobileError(e.status, e.message, e.code ? { code: e.code } : {});
      throw e;
    },
    createPosts: h.createPosts,
    retryPost: h.retryPost,
    listPosts: vi.fn(async () => ({ posts: [], nextCursor: null })),
  };
});
vi.mock("@/app/api/social/captions/route", () => ({ POST: h.webCaptions }));

const { PostError } = await import("@/lib/mobile/posts");
const postsRoute = await import("./posts/route");
const retry = (await import("./posts/[id]/retry/route")).POST;
const captions = (await import("./captions/route")).POST;

const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost/api/mobile/v1/social${url}`, { method, headers: { authorization: "Bearer acc" }, ...(body ? { body: JSON.stringify(body) } : {}) });
const good = { source: { clipId: "c1" }, accountIds: ["a1"], caption: "Hi", hashtags: ["#a"], when: "now" };

beforeEach(() => {
  vi.clearAllMocks();
  h.subscriber.value = true;
});

describe("/social/posts", () => {
  it("is for paid plans", async () => {
    h.subscriber.value = false;
    const res = await postsRoute.GET(req("/posts"));
    expect([res.status, (await res.json()).code]).toEqual([402, "subscription_required"]);
  });

  it("creates with the defaults filled in, and answers 201", async () => {
    h.createPosts.mockResolvedValue({ posts: [], warnings: [] });
    const res = await postsRoute.POST(req("/posts", "POST", good));
    expect(res.status).toBe(201);
    expect(h.createPosts).toHaveBeenCalledWith("u1", expect.objectContaining({ privacy: "public", when: "now" }));
  });

  it("refuses a bad body before doing anything", async () => {
    const res = await postsRoute.POST(req("/posts", "POST", { ...good, hashtags: ["no hash"], when: "tomorrow" }));
    expect(res.status).toBe(400);
    expect(h.createPosts).not.toHaveBeenCalled();
  });

  it("answers a refusal with its status and code", async () => {
    h.createPosts.mockRejectedValue(new PostError(429, "You can schedule up to 10 posts a day.", "post_limit"));
    const res = await postsRoute.POST(req("/posts", "POST", good));
    expect([res.status, (await res.json()).code]).toEqual([429, "post_limit"]);
    h.retryPost.mockRejectedValue(new PostError(404, "gone", "not_found"));
    const r2 = await retry(req("/posts/p1/retry", "POST", {}), { params: Promise.resolve({ id: "p1" }) });
    expect(r2.status).toBe(404);
  });
});

describe("/social/captions", () => {
  it("wraps the web's caption ideas, with # on the hashtags", async () => {
    h.webCaptions.mockResolvedValue(NextResponse.json({ data: { captions: { captions: [{ text: "Most founders…", tone: "bold" }], hashtags: ["founders", "#startup"] } } }));
    const res = await captions(req("/captions?tz=Asia/Kolkata", "POST", { accountId: "a1", brief: "fundraising lessons" }));
    expect(await res.json()).toEqual({ captions: [{ text: "Most founders…", tone: "bold" }], hashtags: ["#founders", "#startup"] });
  });
});
