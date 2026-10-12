// @vitest-environment node
//
// The Social Studio's posts (lib/mobile/posts.ts): who can touch what, which
// states allow which change, the per-person cap, and what "now" does on each
// platform.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  cp: {
    findMany: vi.fn(async (_a: unknown) => [] as unknown[]),
    findFirst: vi.fn(async (_a: unknown) => null as unknown),
    create: vi.fn(),
    updateMany: vi.fn(async (_a: unknown) => ({ count: 1 })),
    deleteMany: vi.fn(async (_a: unknown) => ({ count: 1 })),
    count: vi.fn(async (_a: unknown) => 0),
  },
  accounts: vi.fn(async (_a: unknown) => [] as unknown[]),
  accountOne: vi.fn(async (_a: unknown) => ({ status: "active" }) as unknown),
  clip: vi.fn(async (_a: unknown) => null as unknown),
  asset: vi.fn(async (_a: unknown) => null as unknown),
  enqueue: vi.fn(async (_id: string) => {}),
  resolve: vi.fn(async () => "ig_123" as string | null),
  uploadsUsed: { n: 0 },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clipPublish: h.cp,
    socialAccount: { findMany: h.accounts, findUnique: h.accountOne },
    clip: { findFirst: h.clip },
    asset: { findFirst: h.asset },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(), requireSubscriber: vi.fn(), convertToMobileSession: vi.fn(), verifyToken: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }));
vi.mock("@/lib/redis", () => ({ redis: { get: vi.fn(async () => String(h.uploadsUsed.n)) } }));
vi.mock("@/lib/signed-media", () => ({ resignMediaUrl: vi.fn(async (u: string | null) => u && `${u}?signed`) }));
vi.mock("@/lib/social/service", () => ({ getValidAccessToken: vi.fn() }));
vi.mock("@/lib/social/google", () => ({ uploadVideo: vi.fn(), NeedsReauthError: class extends Error {} }));
vi.mock("@/utils/s3-upload", () => ({ openS3ObjectStream: vi.fn(), getAssetReadUrl: vi.fn(async (k: string) => `https://s3/${k}?signed`) }));
vi.mock("@/lib/social/publish-queue", () => ({ enqueuePost: h.enqueue }));
vi.mock("@/lib/autoclip-publish", () => ({ resolveProviderPostId: h.resolve }));

const posts = await import("./posts");
const { PostError } = posts;

const MIN = 60_000;
const YT = { id: "acc_yt", userId: "u1", provider: "youtube", status: "active", displayName: "My Channel", username: "me" };
const IG = { id: "acc_ig", userId: "u1", provider: "instagram", status: "active", displayName: null, username: "me.ig" };
const CLIP = { id: "c1", index: 0, title: "The hook", videoUrl: "https://b.s3.x.amazonaws.com/c1.mp4", thumbnailUrl: "https://t/c1.jpg", status: "ready", durationSec: 30, aspectRatio: "9:16" };

/** A stored post with everything POST_INCLUDE loads. */
const row = (over: Record<string, unknown> = {}) => ({
  id: "p1", userId: "u1", clipId: "c1", assetId: null, socialAccountId: YT.id, title: null, caption: "Hi", hashtags: ["#a"],
  privacy: "public", source: "app", status: "pending", scheduledFor: new Date(Date.now() + 60 * MIN), publishedAt: null,
  permalink: null, providerPostId: null, failureReason: null, createdAt: new Date(),
  clip: CLIP, asset: null, socialAccount: YT, ...over,
});

const body = (over: Record<string, unknown> = {}) => ({
  source: { clipId: "c1" }, accountIds: [YT.id], caption: "Hi", hashtags: ["#a"], privacy: "public" as const, when: "now", ...over,
});

/** The error a call rejects with, as [status, code]. */
const refusal = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(PostError);
  return [(e as InstanceType<typeof PostError>).status, (e as InstanceType<typeof PostError>).code];
};

beforeEach(() => {
  vi.clearAllMocks();
  h.uploadsUsed.n = 0;
  h.accounts.mockResolvedValue([YT]);
  h.clip.mockResolvedValue(CLIP);
  h.cp.findFirst.mockResolvedValue(null);
  h.cp.count.mockResolvedValue(0);
  h.cp.updateMany.mockResolvedValue({ count: 1 });
  h.cp.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    row({ ...data, id: `p_${data.socialAccountId}`, socialAccount: data.socialAccountId === IG.id ? IG : YT }));
});

describe("status", () => {
  it("shows each stored state the way the app names it", () => {
    const now = new Date();
    const at = (status: string, scheduledFor: Date | null, socialAccount = YT) => posts.postStatus({ status, scheduledFor, socialAccount } as never, now);
    expect(at("pending", new Date(now.getTime() + MIN))).toBe("scheduled");
    expect(at("pending", now)).toBe("posting");
    expect(at("pending", now, IG as never)).toBe("your_turn");
    expect(at("publishing", now)).toBe("posting");
    expect(at("linked", null)).toBe("posted");
    expect(at("awaiting_manual", now)).toBe("your_turn");
    expect(at("expired", now)).toBe("missed");
  });
});

describe("create", () => {
  it("posts to YouTube now through the queue, as the app's post", async () => {
    const res = await posts.createPosts("u1", body());
    expect(h.cp.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "u1", clipId: "c1", assetId: null, source: "app", status: "pending", privacy: "public", caption: "Hi", hashtags: ["#a"] }),
    }));
    expect(h.enqueue).toHaveBeenCalledWith("p_acc_yt");
    expect(res.posts[0]).toMatchObject({ status: "posting", title: "The hook", account: { provider: "youtube", name: "My Channel" }, editable: false });
    expect(res.warnings).toEqual([]);
  });

  it("makes an Instagram post-now the person's turn straight away, without the queue", async () => {
    h.accounts.mockResolvedValue([IG]);
    const res = await posts.createPosts("u1", body({ accountIds: [IG.id] }));
    expect(h.cp.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "awaiting_manual" }) }));
    expect(h.enqueue).not.toHaveBeenCalled();
    expect(res.posts[0]!.status).toBe("your_turn");
  });

  it("schedules for later without starting anything", async () => {
    const when = new Date(Date.now() + 2 * 3600_000).toISOString();
    const res = await posts.createPosts("u1", body({ when }));
    expect(h.enqueue).not.toHaveBeenCalled();
    expect(res.posts[0]).toMatchObject({ status: "scheduled", editable: true });
  });

  it("refuses a time too soon or too far", async () => {
    expect(await refusal(posts.createPosts("u1", body({ when: new Date(Date.now() + 2 * MIN).toISOString() })))).toEqual([400, "invalid_time"]);
    expect(await refusal(posts.createPosts("u1", body({ when: new Date(Date.now() + 100 * 86_400_000).toISOString() })))).toEqual([400, "invalid_time"]);
  });

  it("only posts to the person's own, connected accounts", async () => {
    h.accounts.mockResolvedValue([]); // someone else's id finds nothing
    expect(await refusal(posts.createPosts("u1", body({ accountIds: ["acc_other"] })))).toEqual([404, "not_found"]);
    expect(h.accounts).toHaveBeenCalledWith({ where: { id: { in: ["acc_other"] }, userId: "u1" } });
    h.accounts.mockResolvedValue([{ ...YT, status: "needs_reauth" }]);
    expect(await refusal(posts.createPosts("u1", body()))).toEqual([409, "needs_reconnect"]);
    expect(h.cp.create).not.toHaveBeenCalled();
  });

  it("only posts the person's own, finished video", async () => {
    h.clip.mockResolvedValueOnce(null);
    expect(await refusal(posts.createPosts("u1", body()))).toEqual([404, "not_found"]);
    expect(h.clip).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "c1", project: { userId: "u1" } } }));
    h.clip.mockResolvedValueOnce({ ...CLIP, status: "rendering", videoUrl: null });
    expect(await refusal(posts.createPosts("u1", body()))).toEqual([409, "not_ready"]);
    h.asset.mockResolvedValueOnce({ id: "a1", kind: "image", status: "ready" });
    expect(await refusal(posts.createPosts("u1", body({ source: { assetId: "a1" } })))).toEqual([400, "wrong_kind"]);
  });

  it("holds Instagram to its 2,200-character caption", async () => {
    h.accounts.mockResolvedValue([IG]);
    expect(await refusal(posts.createPosts("u1", body({ accountIds: [IG.id], caption: "x".repeat(2201) })))).toEqual([400, "caption_too_long"]);
  });

  it("stops at 10 posts a day, counting each account", async () => {
    h.cp.count.mockResolvedValue(9);
    h.accounts.mockResolvedValue([YT, IG]);
    expect(await refusal(posts.createPosts("u1", body({ accountIds: [YT.id, IG.id] })))).toEqual([429, "post_limit"]);
  });

  it("refuses a double tap: the same video, account and minute", async () => {
    h.cp.findFirst.mockResolvedValueOnce({ id: "p0" });
    expect(await refusal(posts.createPosts("u1", body()))).toEqual([409, "duplicate"]);
  });

  it("warns when YouTube won't make it a Short, and when today's uploads are used up", async () => {
    h.asset.mockResolvedValueOnce({ id: "a1", kind: "video", status: "ready", duration: 300, width: 1920, height: 1080 });
    h.uploadsUsed.n = 6;
    const res = await posts.createPosts("u1", body({ source: { assetId: "a1" } }));
    expect(res.warnings).toEqual(["not_short", "uploads_busy"]);
  });
});

describe("list", () => {
  it("lists only the person's posts, and pages", async () => {
    h.cp.findMany.mockResolvedValueOnce([row({ id: "p1" }), row({ id: "p2" })]);
    const res = await posts.listPosts("u1", { limit: 1 });
    const where = (h.cp.findMany.mock.calls[0]![0] as { where: { userId: string; socialAccount: { userId: string } } }).where;
    expect([where.userId, where.socialAccount.userId]).toEqual(["u1", "u1"]);
    expect(res.posts.map((p) => p.id)).toEqual(["p1"]);
    expect(res.nextCursor).toBe("p1");
    expect(res.posts[0]!.thumbnailUrl).toBe("https://t/c1.jpg?signed");
  });

  it("refuses an unknown status or date", async () => {
    expect(await refusal(posts.listPosts("u1", { status: "bogus" }))).toEqual([400, "invalid_request"]);
    expect(await refusal(posts.listPosts("u1", { from: "soon" }))).toEqual([400, "invalid_request"]);
  });
});

describe("change, cancel, retry, link", () => {
  it("can't see another person's post", async () => {
    expect(await refusal(posts.deletePost("u1", "p_theirs"))).toEqual([404, "not_found"]);
    expect(h.cp.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p_theirs", userId: "u1" } }));
  });

  it("changes a scheduled post only while it hasn't started", async () => {
    h.cp.findFirst.mockResolvedValue(row());
    await posts.updatePost("u1", "p1", { caption: "New" });
    expect(h.cp.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ id: "p1", userId: "u1", status: "pending" }), data: { caption: "New" } });
    h.cp.findFirst.mockResolvedValue(row({ status: "linked" }));
    expect(await refusal(posts.updatePost("u1", "p1", { caption: "New" }))).toEqual([409, "not_editable"]);
    h.cp.findFirst.mockResolvedValue(row());
    h.cp.updateMany.mockResolvedValueOnce({ count: 0 }); // the scheduler claimed it in between
    expect(await refusal(posts.updatePost("u1", "p1", { caption: "New" }))).toEqual([409, "not_editable"]);
  });

  it("won't delete a post mid-upload", async () => {
    h.cp.findFirst.mockResolvedValue(row({ status: "publishing" }));
    expect(await refusal(posts.deletePost("u1", "p1"))).toEqual([409, "posting"]);
    h.cp.findFirst.mockResolvedValue(row({ status: "linked" }));
    await posts.deletePost("u1", "p1");
    expect(h.cp.deleteMany).toHaveBeenCalledWith({ where: { id: "p1", userId: "u1", status: { not: "publishing" } } });
  });

  it("retries a failed YouTube post now, through the queue", async () => {
    h.cp.findFirst.mockResolvedValue(row({ status: "failed", failureReason: "x" }));
    await posts.retryPost("u1", "p1");
    expect(h.cp.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", userId: "u1", status: { in: ["failed", "expired"] } },
      data: expect.objectContaining({ status: "pending", failureReason: null }),
    });
    expect(h.enqueue).toHaveBeenCalledWith("p1");
  });

  it("asks to reconnect before a retry can work", async () => {
    h.cp.findFirst.mockResolvedValue(row({ status: "failed" }));
    h.accountOne.mockResolvedValueOnce({ status: "needs_reauth" });
    expect(await refusal(posts.retryPost("u1", "p1"))).toEqual([409, "needs_reconnect"]);
    expect(h.enqueue).not.toHaveBeenCalled();
  });

  it("links a post the person made themselves", async () => {
    h.cp.findFirst.mockResolvedValue(row({ status: "awaiting_manual", socialAccount: IG }));
    await posts.linkPost("u1", "p1", "https://www.instagram.com/reel/abc/");
    expect(h.cp.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", userId: "u1", status: { notIn: ["publishing", "linked"] } },
      data: expect.objectContaining({ status: "linked", permalink: "https://www.instagram.com/reel/abc/", providerPostId: "ig_123" }),
    });
  });
});
