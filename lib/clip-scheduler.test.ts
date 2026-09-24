// @vitest-environment node
//
// The scheduled-publish cron must upload each row exactly once.
//
// Nothing claimed a row before uploading it, so a run that outlasted the
// 10-minute cron interval was still holding "pending" rows when the next run
// selected them — and both uploaded the same clip to YouTube.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { claim, upload } = vi.hoisted(() => ({
  claim: vi.fn(async (_a: unknown) => ({ count: 1 })),
  upload: vi.fn(async (..._a: unknown[]) => ({ videoId: "yt1" })),
}));

const dueRow = {
  id: "pub_1",
  clip: { id: "c1", title: "Hook", videoUrl: "https://s3/c1.mp4", status: "ready" },
  socialAccount: { id: "acc1", provider: "youtube", status: "active" },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clipPublish: {
      findMany: vi.fn(async () => [dueRow]),
      updateMany: vi.fn(async (a: { where: { id?: string } }) => (a.where.id ? claim(a) : { count: 0 })),
      update: vi.fn(async () => ({})),
    },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/social/service", () => ({ getValidAccessToken: vi.fn(async () => "tok") }));
vi.mock("@/lib/social/google", () => ({
  uploadVideo: (...a: unknown[]) => upload(...a),
  NeedsReauthError: class NeedsReauthError extends Error {},
}));
vi.mock("@/utils/download", () => ({ downloadFile: vi.fn(async (_u: string, dest: string) => {
  (await import("fs")).writeFileSync(dest, "x");
}) }));

const { publishDueClips } = await import("./clip-scheduler");

beforeEach(() => {
  vi.clearAllMocks();
  claim.mockResolvedValue({ count: 1 });
});

describe("publishDueClips", () => {
  it("claims a row (pending -> publishing) before uploading it", async () => {
    const result = await publishDueClips();
    expect(claim).toHaveBeenCalledWith({ where: { id: "pub_1", status: "pending" }, data: { status: "publishing" } });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(result.published).toBe(1);
  });

  it("skips a row another run already claimed, without uploading it again", async () => {
    claim.mockResolvedValueOnce({ count: 0 });
    const result = await publishDueClips();
    expect(upload).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });
});
