import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string; email: string; sessionId: string } | null = null;
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));

let attachment: { id: string; userId: string; s3Key: string; thumbnailS3Key: string | null } | null;
const attachmentDelete = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    reviewAttachment: {
      findUnique: vi.fn(async () => attachment),
      delete: (...args: unknown[]) => attachmentDelete(...args),
    },
  },
}));

const deleteS3Object = vi.fn(async () => {});
vi.mock("@/utils/s3-upload", () => ({ deleteS3Object: (...args: unknown[]) => deleteS3Object(...args) }));

const { DELETE } = await import("./route");

function del(id: string) {
  return DELETE(new NextRequest(`http://localhost/api/reviews/me/attachments/${id}`, { method: "DELETE", headers: { Authorization: "Bearer tok" } }), {
    params: Promise.resolve({ attachmentId: id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authUser = { userId: "u1", email: "u1@test.com", sessionId: "s1" };
  attachment = { id: "att-1", userId: "u1", s3Key: "review-attachments/u1/a.png", thumbnailS3Key: null };
});

describe("DELETE /api/reviews/me/attachments/[attachmentId]", () => {
  it("401s when unauthenticated", async () => {
    authUser = null;
    const res = await del("att-1");
    expect(res.status).toBe(401);
  });

  it("404s when the attachment doesn't exist", async () => {
    attachment = null;
    const res = await del("att-1");
    expect(res.status).toBe(404);
  });

  it("404s when the attachment belongs to someone else", async () => {
    attachment = { id: "att-1", userId: "someone-else", s3Key: "x", thumbnailS3Key: null };
    const res = await del("att-1");
    expect(res.status).toBe(404);
  });

  it("deletes the row and the S3 object(s)", async () => {
    attachment = { id: "att-1", userId: "u1", s3Key: "review-attachments/u1/a.mp4", thumbnailS3Key: "thumbnails/u1/a.jpg" };
    const res = await del("att-1");
    expect(res.status).toBe(200);
    expect(attachmentDelete).toHaveBeenCalledWith({ where: { id: "att-1" } });
    expect(deleteS3Object).toHaveBeenCalledWith("review-attachments/u1/a.mp4");
    expect(deleteS3Object).toHaveBeenCalledWith("thumbnails/u1/a.jpg");
  });
});
