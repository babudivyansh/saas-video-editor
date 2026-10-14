import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string } | null = { userId: "u1" };
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const S3 = (key: string) => `https://bucket.s3.ap-south-1.amazonaws.com/${key}`;
const copyS3Object = vi.fn(async (_from: string, _to: string) => {});
vi.mock("@/utils/s3-upload", () => ({
  copyS3Object: (a: string, b: string) => copyS3Object(a, b),
  s3KeyToPublicUrl: (k: string) => S3(k),
}));

let clip: Record<string, unknown> | null;
const clipCreate = vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: "c-new", index: a.data.index, title: a.data.title }));
const findFirst = vi.fn(async (a: { where: { id?: string; projectId: string; project?: { userId: string } } }) => {
  if (a.where.id === undefined) return { index: 7 }; // the project's last clip
  return a.where.id === "c1" && a.where.projectId === "p1" && a.where.project?.userId === "u1" ? clip : null;
});
vi.mock("@/lib/prisma", () => ({
  prisma: { clip: { findFirst: (a: never) => findFirst(a), create: (a: never) => clipCreate(a) } },
}));

const { POST } = await import("./route");
const ctx = (id: string, clipId: string) => ({ params: Promise.resolve({ id, clipId }) });
const req = () => new NextRequest("http://localhost/api/projects/p1/clips/c1/duplicate", { method: "POST" });

beforeEach(() => {
  authUser = { userId: "u1" };
  clip = {
    id: "c1", projectId: "p1", index: 2, title: "Great hook", status: "ready", rerenderCount: 1,
    videoUrl: S3("renders/p1/clip-2.mp4"), thumbnailUrl: S3("renders/p1/clip-2.jpg"),
    startSec: 1, endSec: 30, durationSec: 29, aspectRatio: "9:16", score: 90,
    scoreBreakdown: { hook: 90 }, transcriptJson: null, liteEdits: null, isFavorite: true,
  };
  vi.clearAllMocks();
});

describe("POST .../clips/[clipId]/duplicate", () => {
  it("401s without a session", async () => {
    authUser = null;
    expect((await POST(req(), ctx("p1", "c1"))).status).toBe(401);
  });

  it("404s a clip in a project the caller doesn't own, copying nothing", async () => {
    authUser = { userId: "u2" };
    expect((await POST(req(), ctx("p1", "c1"))).status).toBe(404);
    expect(copyS3Object).not.toHaveBeenCalled();
  });

  it("409s while the clip is rendering", async () => {
    clip!.status = "rendering";
    expect((await POST(req(), ctx("p1", "c1"))).status).toBe(409);
    expect(clipCreate).not.toHaveBeenCalled();
  });

  it("copies the video and thumbnail to NEW keys, so deleting one clip can't break the other", async () => {
    const res = await POST(req(), ctx("p1", "c1"));
    expect(res.status).toBe(201);
    expect(copyS3Object).toHaveBeenCalledTimes(2);
    const [[fromV, toV], [fromT, toT]] = copyS3Object.mock.calls;
    expect(fromV).toBe("renders/p1/clip-2.mp4");
    expect(toV).toMatch(/^renders\/p1\/clip-2-copy-[\w-]+\.mp4$/);
    expect(fromT).toBe("renders/p1/clip-2.jpg");
    expect(toT).toMatch(/^renders\/p1\/clip-2-copy-[\w-]+\.jpg$/);

    const data = clipCreate.mock.calls[0][0].data;
    expect(data.videoUrl).toBe(S3(toV));
    expect(data.thumbnailUrl).toBe(S3(toT));
    expect(data.videoUrl).not.toBe(clip!.videoUrl);
  });

  it("lands after the project's last clip, titled as a copy, keeping the re-render count", async () => {
    await POST(req(), ctx("p1", "c1"));
    const data = clipCreate.mock.calls[0][0].data;
    expect(data.index).toBe(8);
    expect(data.title).toBe("Great hook (copy)");
    expect(data.rerenderCount).toBe(1);
    expect(data.status).toBe("ready");
    // Feedback and memberships stay with the original.
    expect(data).not.toHaveProperty("isFavorite");
  });

  it("creates no row when the copy fails", async () => {
    copyS3Object.mockRejectedValueOnce(new Error("S3 down"));
    expect((await POST(req(), ctx("p1", "c1"))).status).toBe(502);
    expect(clipCreate).not.toHaveBeenCalled();
  });
});
