import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let elevated = true;
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ userId: "admin-1", email: "admin@test.co" })),
}));
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (key: string) => (key.startsWith("admin-elevated:") ? (elevated ? "1" : null) : null)),
    set: vi.fn(async () => {}),
    del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

let review: Record<string, unknown> | null;
const updates: Array<Record<string, unknown>> = [];
const auditLogCreate = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: {
      findUnique: vi.fn(async () => review),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        review = { ...(review as object), ...data };
        return review;
      }),
    },
    auditLog: { create: (...args: unknown[]) => auditLogCreate(...args) },
  },
}));

const notify = vi.fn(async () => {});
vi.mock("@/lib/notify", () => ({ notify: (...args: unknown[]) => notify(...args) }));

const shouldSendCategory = vi.fn(async () => true);
vi.mock("@/lib/notifications", () => ({ shouldSendCategory: (...args: unknown[]) => shouldSendCategory(...args) }));

const sendReviewPublishedEmail = vi.fn(async () => {});
const sendReviewRejectedEmail = vi.fn(async () => {});
vi.mock("@/lib/email", () => ({
  sendReviewPublishedEmail: (...args: unknown[]) => sendReviewPublishedEmail(...args),
  sendReviewRejectedEmail: (...args: unknown[]) => sendReviewRejectedEmail(...args),
}));

const { POST } = await import("./route");

const AUTHOR = { id: "author-1", email: "author@test.com", name: "Author One", firstName: "Author" };

function post(id: string, body: unknown) {
  return POST(
    new NextRequest(`http://localhost/api/admin/reviews/${id}/moderate`, { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  elevated = true;
  review = { id: "rev-1", status: "pending", pinned: false, user: AUTHOR };
  updates.length = 0;
  vi.clearAllMocks();
});

describe("POST /api/admin/reviews/[id]/moderate", () => {
  it("403s when the admin is not elevated", async () => {
    elevated = false;
    const res = await post("rev-1", { action: "approve" });
    expect(res.status).toBe(403);
  });

  it("400s a reject without a reason", async () => {
    const res = await post("rev-1", { action: "reject" });
    expect(res.status).toBe(400);
  });

  it("approves a pending review and writes an audit entry", async () => {
    const res = await post("rev-1", { action: "approve" });
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ status: "published", moderatedBy: "admin-1" });
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ adminId: "admin-1", action: "review.approved", targetId: "rev-1" }) }),
    );
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "author-1", type: "review_published" }));
    expect(sendReviewPublishedEmail).toHaveBeenCalledWith("author@test.com", "Author One", expect.stringContaining("/reviews/rev-1"));
  });

  it("skips the email when the author opted out of productUpdates", async () => {
    shouldSendCategory.mockResolvedValueOnce(false);
    await post("rev-1", { action: "approve" });
    expect(sendReviewPublishedEmail).not.toHaveBeenCalled();
  });

  it("409s approving an already-published review", async () => {
    review = { id: "rev-1", status: "published", pinned: false, user: AUTHOR };
    const res = await post("rev-1", { action: "approve" });
    expect(res.status).toBe(409);
  });

  it("rejects with a reason, setting rejectionReason", async () => {
    const res = await post("rev-1", { action: "reject", reason: "Off-topic content" });
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ status: "rejected", rejectionReason: "Off-topic content" });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "author-1", type: "review_rejected" }));
    expect(sendReviewRejectedEmail).toHaveBeenCalledWith("author@test.com", "Author One", "Off-topic content");
  });

  it("hides a published review and clears pin state", async () => {
    review = { id: "rev-1", status: "published", pinned: true, user: AUTHOR };
    const res = await post("rev-1", { action: "hide" });
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ status: "hidden", pinned: false, featuredAt: null });
  });

  it("unhide sends a hidden review back to pending", async () => {
    review = { id: "rev-1", status: "hidden", pinned: false, user: AUTHOR };
    const res = await post("rev-1", { action: "unhide" });
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ status: "pending" });
  });

  it("409s unhide on a review that isn't hidden", async () => {
    const res = await post("rev-1", { action: "unhide" });
    expect(res.status).toBe(409);
  });

  it("pins a published review", async () => {
    review = { id: "rev-1", status: "published", pinned: false, user: AUTHOR };
    const res = await post("rev-1", { action: "pin" });
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ pinned: true });
  });

  it("409s pinning a non-published review", async () => {
    const res = await post("rev-1", { action: "pin" });
    expect(res.status).toBe(409);
  });

  it("unpins regardless of status", async () => {
    review = { id: "rev-1", status: "published", pinned: true, user: AUTHOR };
    const res = await post("rev-1", { action: "unpin" });
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ pinned: false, featuredAt: null });
  });

  it("404s on a missing review", async () => {
    review = null;
    const res = await post("missing", { action: "approve" });
    expect(res.status).toBe(404);
  });
});
