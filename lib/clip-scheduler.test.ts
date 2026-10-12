// @vitest-environment node
//
// The scheduled-publish cron: each due post goes through runPost (which
// claims it, so a run that outlasts the 10-minute interval can't upload a
// clip twice — see lib/social/publish.test.ts), and posts that can never
// finish are closed with a reason the person is told.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(async (_a: unknown) => ({ count: 1 })),
  runPost: vi.fn(async (_id: string) => "published"),
  notifyPost: vi.fn(async (..._a: unknown[]) => {}),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { clipPublish: { findMany: h.findMany, updateMany: h.updateMany } } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/social/publish", () => ({
  AUTO_PUBLISH_PROVIDERS: new Set(["youtube"]),
  POST_INCLUDE: {},
  runPost: h.runPost,
  notifyPost: h.notifyPost,
}));

const { publishDueClips } = await import("./clip-scheduler");

/** findMany answers by what it's asked for: due, stuck claims, missed. */
function rows({ due = [] as string[], stuck = [] as string[], missed = [] as string[] }) {
  h.findMany.mockImplementation(async (a: { where: { status: string; OR?: unknown; scheduledFor?: { lte?: Date } } }) => {
    if (a.where.status === "publishing") return stuck.map((id) => ({ id }));
    if (a.where.scheduledFor?.lte) return due.map((id) => ({ id }));
    return missed.map((id) => ({ id }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.runPost.mockResolvedValue("published");
});

describe("publishDueClips", () => {
  it("posts each due post and counts the outcomes", async () => {
    rows({ due: ["p1", "p2", "p3", "p4"] });
    h.runPost.mockResolvedValueOnce("published").mockResolvedValueOnce("reminded").mockResolvedValueOnce("failed").mockResolvedValueOnce("busy");
    expect(await publishDueClips()).toEqual({ published: 1, reminded: 1, failed: 1, skipped: 1 });
    expect(h.runPost.mock.calls.map((c) => c[0])).toEqual(["p1", "p2", "p3", "p4"]);
  });
});

describe("publishDueClips — posts that can't finish", () => {
  it("fails a publish claim held long past its start, and says to check the channel", async () => {
    // Put back to pending instead, a clip that DID reach YouTube before the
    // crash would be uploaded twice. Failed, with the reason saying to check.
    rows({ stuck: ["p9"] });
    await publishDueClips();
    const args = h.updateMany.mock.calls[0]![0] as { where: { id: { in: string[] }; status: string }; data: { status: string; failureReason: string } };
    expect(args.where).toEqual({ id: { in: ["p9"] }, status: "publishing" });
    expect(args.data.status).toBe("failed");
    expect(args.data.failureReason).toMatch(/Check your YouTube channel/);
    expect(h.notifyPost).toHaveBeenCalledWith({ id: "p9" }, "social_post_failed", args.data.failureReason);
  });

  it("marks a post missed after a day, with a reason, and tells the person", async () => {
    rows({ missed: ["p7"] });
    await publishDueClips();
    const args = h.updateMany.mock.calls[0]![0] as { data: { status: string; failureReason: string } };
    expect(args.data).toEqual({ status: "expired", failureReason: expect.stringMatching(/within a day/) });
    expect(h.notifyPost).toHaveBeenCalledWith({ id: "p7" }, "social_post_failed", args.data.failureReason);
  });
});
