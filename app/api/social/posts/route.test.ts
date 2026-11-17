import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// The web posts routes are thin: auth, a readable 400, and the shared post
// service (lib/mobile/posts.ts, tested with the mobile routes). These pin the
// two things the web adds on top: the service's own errors keep their status
// and message, and a bad body says which field is wrong.

let subscriber: { userId: string; email: string; sessionId: string } | null = null;
vi.mock("@/lib/auth", () => ({
  requireSubscriber: vi.fn(async () => subscriber),
  getAuthUser: vi.fn(async () => subscriber),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true, remaining: 0 })) }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

class PostError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}
const createPosts = vi.fn();
const listPosts = vi.fn();
const linkPost = vi.fn();
vi.mock("@/lib/mobile/posts", () => ({
  PostError,
  createPosts: (...a: unknown[]) => createPosts(...a),
  listPosts: (...a: unknown[]) => listPosts(...a),
  linkPost: (...a: unknown[]) => linkPost(...a),
}));

const { GET, POST } = await import("./route");
const { POST: LINK } = await import("./[id]/link/route");

const req = (url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  subscriber = { userId: "u1", email: "u1@example.com", sessionId: "s1" };
});

describe("/api/social/posts", () => {
  it("lists the caller's posts, passing the filters through", async () => {
    listPosts.mockResolvedValue({ posts: [], nextCursor: null });
    const res = await GET(req("/api/social/posts?status=scheduled"));
    expect(res.status).toBe(200);
    expect(listPosts).toHaveBeenCalledWith("u1", expect.objectContaining({ status: "scheduled" }));
  });

  it("is paid-plan only", async () => {
    subscriber = null;
    const res = await GET(req("/api/social/posts"));
    expect(res.status).toBe(402);
    expect(listPosts).not.toHaveBeenCalled();
  });

  it("names the field that's wrong instead of 'Validation failed'", async () => {
    const res = await POST(req("/api/social/posts", { source: { clipId: "c1" }, accountIds: [], when: "now" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Pick where to post");
    expect(createPosts).not.toHaveBeenCalled();
  });

  it("keeps the post service's own status and message", async () => {
    createPosts.mockRejectedValue(new PostError(409, "This clip hasn’t finished rendering yet.", "not_ready"));
    const res = await POST(req("/api/social/posts", { source: { clipId: "c1" }, accountIds: ["a1"], when: "now" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "This clip hasn’t finished rendering yet.", code: "not_ready" });
  });

  it("creates one post per account and answers 201", async () => {
    createPosts.mockResolvedValue({ posts: [{ id: "p1" }, { id: "p2" }], warnings: [] });
    const res = await POST(req("/api/social/posts", { source: { clipId: "c1" }, accountIds: ["a1", "a2"], when: "now" }));
    expect(res.status).toBe(201);
    expect((await res.json()).data.posts).toHaveLength(2);
    expect(createPosts).toHaveBeenCalledWith("u1", expect.objectContaining({ accountIds: ["a1", "a2"], caption: "", hashtags: [] }));
  });

  it("asks for the post's link when what was pasted isn't one", async () => {
    const res = await LINK(req("/api/social/posts/p1/link", { permalink: "not a link" }), params("p1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Paste the post's link");
    expect(linkPost).not.toHaveBeenCalled();
  });
});
