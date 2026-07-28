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
let attachmentCount: number;
const pendingUploadCreate = vi.fn(async () => ({ id: "pending-1" }));
const pendingUploadDelete = vi.fn(async () => ({}));
const attachmentCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "att-1", ...data }));
const reviewUpdate = vi.fn(async () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: {
      findUnique: vi.fn(async () => review),
      update: (...args: unknown[]) => reviewUpdate(...args),
    },
    reviewAttachment: {
      count: vi.fn(async () => attachmentCount),
      create: (...args: Parameters<typeof attachmentCreate>) => attachmentCreate(...args),
    },
    pendingUpload: {
      create: (...args: Parameters<typeof pendingUploadCreate>) => pendingUploadCreate(...args),
      delete: (...args: Parameters<typeof pendingUploadDelete>) => pendingUploadDelete(...args),
    },
  },
}));

const uploadBufferToS3 = vi.fn(async () => "https://bucket.s3.amazonaws.com/key");
const deleteS3Object = vi.fn(async () => {});
vi.mock("@/utils/s3-upload", () => ({
  uploadBufferToS3: (...args: unknown[]) => uploadBufferToS3(...args),
  sanitizeS3Key: (k: string) => k,
  extensionForMime: (m: string) => (m === "image/png" ? "png" : m === "video/mp4" ? "mp4" : "bin"),
  deleteS3Object: (...args: unknown[]) => deleteS3Object(...args),
}));

const enqueueReviewAttachmentModeration = vi.fn();
vi.mock("@/lib/reviews/attachment-moderation", () => ({
  enqueueReviewAttachmentModeration: (...args: unknown[]) => enqueueReviewAttachmentModeration(...args),
}));

const { POST } = await import("./route");

function post(body: FormData | null, token: string | null = "tok") {
  return POST(
    new NextRequest("http://localhost/api/reviews/me/attachments", {
      method: "POST",
      body,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }),
  );
}

function fileFormData(name: string, type: string, sizeBytes: number): FormData {
  const form = new FormData();
  const file = new File([new Uint8Array(sizeBytes)], name, { type });
  form.append("file", file);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  authUser = { userId: "u1", email: "u1@test.com", sessionId: "s1" };
  review = { id: "rev-1", userId: "u1", status: "pending" };
  attachmentCount = 0;
});

describe("POST /api/reviews/me/attachments", () => {
  it("401s when unauthenticated", async () => {
    authUser = null;
    const res = await post(fileFormData("a.png", "image/png", 1000));
    expect(res.status).toBe(401);
  });

  it("404s when the caller has no review yet", async () => {
    review = null;
    const res = await post(fileFormData("a.png", "image/png", 1000));
    expect(res.status).toBe(404);
  });

  it("409s once the review already has the max attachments", async () => {
    attachmentCount = 5;
    const res = await post(fileFormData("a.png", "image/png", 1000));
    expect(res.status).toBe(409);
  });

  it("415s on an unsupported mime type", async () => {
    const res = await post(fileFormData("a.txt", "text/plain", 1000));
    expect(res.status).toBe(415);
  });

  it("413s an oversized image", async () => {
    const res = await post(fileFormData("a.png", "image/png", 16 * 1024 * 1024));
    expect(res.status).toBe(413);
  });

  it("413s an oversized video", async () => {
    const res = await post(fileFormData("a.mp4", "video/mp4", 101 * 1024 * 1024));
    expect(res.status).toBe(413);
  });

  it("uploads a valid image, creates the row, and enqueues moderation", async () => {
    const res = await post(fileFormData("a.png", "image/png", 1000));
    expect(res.status).toBe(201);
    expect(uploadBufferToS3).toHaveBeenCalled();
    expect(attachmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reviewId: "rev-1", userId: "u1", kind: "image" }) }),
    );
    expect(enqueueReviewAttachmentModeration).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentId: "att-1", reviewId: "rev-1" }),
    );
    expect(pendingUploadDelete).toHaveBeenCalled();
  });

  it("re-queues a published review for moderation when a new attachment is added", async () => {
    review = { id: "rev-1", userId: "u1", status: "published" };
    await post(fileFormData("a.png", "image/png", 1000));
    expect(reviewUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "pending" }) }),
    );
  });

  it("does not touch review status when it's already pending", async () => {
    await post(fileFormData("a.png", "image/png", 1000));
    expect(reviewUpdate).not.toHaveBeenCalled();
  });
});
