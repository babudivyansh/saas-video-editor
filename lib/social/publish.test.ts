// @vitest-environment node
//
// Posting one due post (lib/social/publish.ts): what goes out, the claim, the
// app-wide YouTube quota guard, and what the person is told.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(async (_a: unknown) => ({ count: 1 })),
  update: vi.fn(async (_a: unknown) => ({})),
  accountUpdate: vi.fn(async (_a: unknown) => ({})),
  notify: vi.fn(async (_a: unknown) => {}),
  upload: vi.fn(async (..._a: unknown[]) => ({ videoId: "yt1", permalink: "https://www.youtube.com/watch?v=yt1" })),
  counter: { n: 0 },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clipPublish: { findUnique: h.findUnique, updateMany: h.updateMany, update: h.update, count: vi.fn(async () => 0) },
    socialAccount: { update: h.accountUpdate },
  },
}));
vi.mock("@/lib/env", () => ({ env: { SOCIAL_YOUTUBE_DAILY_UPLOADS: "2" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/notify", () => ({ notify: h.notify }));
vi.mock("@/lib/redis", () => ({
  redis: {
    incrWithExpire: vi.fn(async () => ++h.counter.n),
    decrFloor: vi.fn(async () => { h.counter.n = Math.max(0, h.counter.n - 1); }),
    get: vi.fn(async () => String(h.counter.n)),
  },
}));
vi.mock("@/lib/social/service", () => ({ getValidAccessToken: vi.fn(async () => "tok") }));
vi.mock("@/lib/social/google", () => ({
  uploadVideo: (...a: unknown[]) => h.upload(...a),
  NeedsReauthError: class NeedsReauthError extends Error {},
}));
vi.mock("@/utils/s3-upload", () => ({ openS3ObjectStream: vi.fn(async (key: string) => ({ stream: `stream:${key}`, size: 42 })) }));

const { NeedsReauthError } = await import("@/lib/social/google");
const pub = await import("./publish");

const S3 = "https://bucket.s3.ap-south-1.amazonaws.com";
const row = (over: Record<string, unknown> = {}) => ({
  id: "p1", userId: "u1", status: "pending", title: null, caption: "Watch this", hashtags: ["#founders", "#startup"], privacy: "public",
  socialAccountId: "acc1",
  clip: { id: "c1", index: 0, title: "The hook", videoUrl: `${S3}/clips/c1.mp4`, thumbnailUrl: null, status: "ready", durationSec: 30, aspectRatio: "9:16" },
  asset: null,
  socialAccount: { id: "acc1", provider: "youtube", status: "active" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.counter.n = 0;
  h.updateMany.mockResolvedValue({ count: 1 });
});

describe("what a post goes out with", () => {
  it("puts the hashtags after the caption, and keeps the old line when both are empty", () => {
    expect(pub.postDescription("Watch this", ["#a", "#b"])).toBe("Watch this\n\n#a #b");
    expect(pub.postDescription(null, [])).toBe(pub.DEFAULT_DESCRIPTION);
  });

  it("titles a post by its own title, else the clip's, else the file name", () => {
    expect(pub.postTitle(row({ title: "Mine" }) as never)).toBe("Mine");
    expect(pub.postTitle(row() as never)).toBe("The hook");
    expect(pub.postTitle(row({ clip: null, asset: { name: "launch-cut.mp4" } }) as never)).toBe("launch-cut");
  });

  it("finds the video: streamed from S3, waiting on a render, or gone", () => {
    expect(pub.videoOf(row() as never)).toEqual({ key: "clips/c1.mp4" });
    expect(pub.videoOf(row({ clip: { ...row().clip, status: "rendering", videoUrl: null } }) as never)).toEqual({ wait: true });
    expect(pub.videoOf(row({ clip: null, asset: { kind: "video", status: "ready", s3Key: "uploads/u1/v.mp4" } }) as never)).toEqual({ key: "uploads/u1/v.mp4" });
    expect(pub.videoOf(row({ clip: null, asset: null }) as never)).toEqual({ gone: true });
  });
});

describe("runPost", () => {
  it("claims, streams the video to YouTube with the caption, and says it's live", async () => {
    h.findUnique.mockResolvedValue(row());
    expect(await pub.runPost("p1")).toBe("published");
    expect(h.updateMany).toHaveBeenCalledWith({ where: { id: "p1", status: "pending" }, data: { status: "publishing" } });
    expect(h.upload).toHaveBeenCalledWith("tok", expect.objectContaining({
      stream: "stream:clips/c1.mp4", size: 42, title: "The hook", description: "Watch this\n\n#founders #startup", privacyStatus: "public",
    }));
    expect(h.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "linked", providerPostId: "yt1" }) }));
    expect(h.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "social_post_published", href: "/dashboard/social-tracker?post=p1" }));
  });

  it("doesn't upload a post another worker already claimed", async () => {
    h.findUnique.mockResolvedValue(row());
    h.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await pub.runPost("p1")).toBe("skipped");
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.counter.n).toBe(0); // the quota slot is given back
  });

  it("leaves a post waiting once today's app-wide uploads are used up", async () => {
    h.findUnique.mockResolvedValue(row());
    h.counter.n = 2; // cap is 2 in this test
    expect(await pub.runPost("p1")).toBe("busy");
    expect(h.updateMany).not.toHaveBeenCalled();
    expect(h.upload).not.toHaveBeenCalled();
  });

  it("asks to reconnect when YouTube refuses the upload scope", async () => {
    h.findUnique.mockResolvedValue(row());
    h.upload.mockRejectedValueOnce(new NeedsReauthError());
    expect(await pub.runPost("p1")).toBe("failed");
    expect(h.accountUpdate).toHaveBeenCalledWith({ where: { id: "acc1" }, data: { status: "needs_reauth" } });
    expect(h.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "failed", failureReason: expect.stringMatching(/Reconnect your YouTube/) } });
    expect(h.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "social_post_needs_reconnect" }));
  });

  it("fails a post whose video was deleted, without using quota", async () => {
    h.findUnique.mockResolvedValue(row({ clip: null, asset: null }));
    expect(await pub.runPost("p1")).toBe("failed");
    expect(h.counter.n).toBe(0);
    expect(h.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "social_post_failed" }));
  });

  it("makes a due Instagram post the person's turn", async () => {
    h.findUnique.mockResolvedValue(row({ socialAccount: { id: "acc2", provider: "instagram", status: "active" } }));
    expect(await pub.runPost("p1")).toBe("reminded");
    expect(h.updateMany).toHaveBeenCalledWith({ where: { id: "p1", status: "pending" }, data: { status: "awaiting_manual" } });
    expect(h.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "social_post_your_turn", title: "Time to post on Instagram" }));
    expect(h.upload).not.toHaveBeenCalled();
  });

  it("skips a post that is no longer pending", async () => {
    h.findUnique.mockResolvedValue(row({ status: "linked" }));
    expect(await pub.runPost("p1")).toBe("skipped");
  });
});
