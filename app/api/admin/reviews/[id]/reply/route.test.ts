import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ userId: "admin-1", email: "admin@test.co" })),
}));
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (key: string) => (key.startsWith("admin-elevated:") ? "1" : null)),
    set: vi.fn(async () => {}),
    del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

const AUTHOR = { id: "author-1", email: "author@test.com", name: "Author One", firstName: "Author" };
let review: { id: string; user: typeof AUTHOR } | null;
let existingReply: { reviewId: string; body: string } | null;
let createError: { code: string } | null;
const replyCreate = vi.fn(async (args: { data: { body: string } }) => ({ id: "reply-1", ...args.data }));
const replyUpdate = vi.fn(async (args: { data: { body: string } }) => ({ id: "reply-1", ...args.data }));
const replyDelete = vi.fn(async () => ({}));
const auditLogCreate = vi.fn(async () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: { findUnique: vi.fn(async () => review) },
    reviewReply: {
      findUnique: vi.fn(async () => existingReply),
      create: (args: { data: { body: string } }) => {
        if (createError) throw Object.assign(new Error("dup"), createError);
        return replyCreate(args);
      },
      update: (...args: Parameters<typeof replyUpdate>) => replyUpdate(...args),
      delete: (...args: Parameters<typeof replyDelete>) => replyDelete(...args),
    },
    auditLog: { create: (...args: unknown[]) => auditLogCreate(...args) },
  },
}));

const notify = vi.fn(async () => {});
vi.mock("@/lib/notify", () => ({ notify: (...args: unknown[]) => notify(...args) }));

const shouldSendCategory = vi.fn(async () => true);
vi.mock("@/lib/notifications", () => ({ shouldSendCategory: (...args: unknown[]) => shouldSendCategory(...args) }));

const sendReviewReplyEmail = vi.fn(async () => {});
vi.mock("@/lib/email", () => ({ sendReviewReplyEmail: (...args: unknown[]) => sendReviewReplyEmail(...args) }));

const { POST, PATCH, DELETE } = await import("./route");

function req(method: string, id: string, body?: unknown) {
  const fn = method === "POST" ? POST : method === "PATCH" ? PATCH : DELETE;
  return fn(
    new NextRequest(`http://localhost/api/admin/reviews/${id}/reply`, { method, body: body ? JSON.stringify(body) : undefined }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  review = { id: "rev-1", user: AUTHOR };
  existingReply = null;
  createError = null;
});

describe("POST /api/admin/reviews/[id]/reply", () => {
  it("404s when the review doesn't exist", async () => {
    review = null;
    const res = await req("POST", "rev-1", { body: "Thanks!" });
    expect(res.status).toBe(404);
  });

  it("400s on an empty body", async () => {
    const res = await req("POST", "rev-1", { body: "" });
    expect(res.status).toBe(400);
  });

  it("creates a reply, audits it, and notifies the author", async () => {
    const res = await req("POST", "rev-1", { body: "Thanks for the feedback!" });
    expect(res.status).toBe(201);
    expect(replyCreate).toHaveBeenCalled();
    expect(auditLogCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "review.reply_created", targetId: "rev-1" }) }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "author-1", type: "review_reply" }));
    expect(sendReviewReplyEmail).toHaveBeenCalledWith("author@test.com", "Author One", expect.stringContaining("/reviews/rev-1"));
  });

  it("409s creating a second reply", async () => {
    createError = { code: "P2002" };
    const res = await req("POST", "rev-1", { body: "Thanks!" });
    expect(res.status).toBe(409);
  });
});

describe("PATCH /api/admin/reviews/[id]/reply", () => {
  it("404s when no reply exists", async () => {
    const res = await req("PATCH", "rev-1", { body: "Edited" });
    expect(res.status).toBe(404);
  });

  it("updates an existing reply", async () => {
    existingReply = { reviewId: "rev-1", body: "Old text" };
    const res = await req("PATCH", "rev-1", { body: "New text" });
    expect(res.status).toBe(200);
    expect(replyUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ body: "New text" }) }));
  });
});

describe("DELETE /api/admin/reviews/[id]/reply", () => {
  it("404s when no reply exists", async () => {
    const res = await req("DELETE", "rev-1");
    expect(res.status).toBe(404);
  });

  it("deletes an existing reply", async () => {
    existingReply = { reviewId: "rev-1", body: "Old text" };
    const res = await req("DELETE", "rev-1");
    expect(res.status).toBe(200);
    expect(replyDelete).toHaveBeenCalled();
  });
});
