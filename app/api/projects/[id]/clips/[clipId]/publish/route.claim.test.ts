// @vitest-environment node
//
// POST .../publish — a double-click must not upload the clip to YouTube twice.
//
// There was no claim: two requests both downloaded the clip and both called
// the YouTube upload, leaving the user with a duplicate public video to find
// and delete. The claim is a "publishing" row created under a lock on the
// clip; a failed upload releases it so the user can retry.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { inFlight, publishCreate, publishUpdate, publishDelete, upload } = vi.hoisted(() => ({
  inFlight: vi.fn(async (_a: unknown) => null as unknown),
  publishCreate: vi.fn(async (_a: unknown) => ({ id: "pub_1" })),
  publishUpdate: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: "pub_1", ...a.data })),
  publishDelete: vi.fn(async (_a: unknown) => ({})),
  upload: vi.fn(async (..._a: unknown[]) => ({ videoId: "yt1", permalink: "https://youtu.be/yt1" })),
}));

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1" })) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/prisma", () => {
  const clipPublish = {
    findFirst: (a: unknown) => inFlight(a),
    create: (a: unknown) => publishCreate(a),
    update: (a: { data: Record<string, unknown> }) => publishUpdate(a),
    delete: (a: unknown) => publishDelete(a),
    findMany: vi.fn(async () => []),
  };
  return {
    prisma: {
      project: { findFirst: vi.fn(async () => ({ id: "p1", userId: "u1" })) },
      clip: { findFirst: vi.fn(async () => ({ id: "c1", projectId: "p1", index: 0, title: "Hook", status: "ready", videoUrl: "https://s3/c1.mp4" })) },
      socialAccount: {
        findFirst: vi.fn(async () => ({ id: "acc1", userId: "u1", provider: "youtube" })),
        update: vi.fn(async () => ({})),
      },
      clipPublish,
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ $queryRaw: vi.fn(async () => []), clipPublish })),
    },
  };
});
vi.mock("@/lib/social/service", () => ({ getValidAccessToken: vi.fn(async () => "tok") }));
vi.mock("@/lib/social/google", () => ({
  uploadVideo: (...a: unknown[]) => upload(...a),
  NeedsReauthError: class NeedsReauthError extends Error {},
}));
vi.mock("@/lib/autoclip-publish", () => ({ resolveProviderPostId: vi.fn(async () => null) }));
vi.mock("@/utils/download", () => ({ downloadFile: vi.fn(async (_u: string, dest: string) => {
  (await import("fs")).writeFileSync(dest, "x");
}) }));

const { POST } = await import("./route");

const post = (body: Record<string, unknown> = { socialAccountId: "acc1" }) =>
  POST(
    new NextRequest("http://localhost/api/projects/p1/clips/c1/publish", { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: "p1", clipId: "c1" }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  inFlight.mockResolvedValue(null);
  upload.mockResolvedValue({ videoId: "yt1", permalink: "https://youtu.be/yt1" });
});

describe("POST .../publish (YouTube auto-publish)", () => {
  it("claims, uploads once, and turns the claim into the published row", async () => {
    const res = await post();
    expect(res.status).toBe(201);
    expect(publishCreate).toHaveBeenCalledWith({ data: { clipId: "c1", socialAccountId: "acc1", status: "publishing" } });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(publishUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "pub_1" }, data: expect.objectContaining({ status: "linked" }) }));
  });

  it("refuses a second upload while one is in flight — and never calls YouTube", async () => {
    inFlight.mockResolvedValueOnce({ id: "pub_0" });
    const res = await post();
    expect(res.status).toBe(409);
    expect(upload).not.toHaveBeenCalled();
    expect(publishCreate).not.toHaveBeenCalled();
  });

  it("releases the claim when the upload fails, so the user can retry", async () => {
    upload.mockRejectedValueOnce(new Error("quota"));
    const res = await post();
    expect(res.status).toBe(502);
    expect(publishDelete).toHaveBeenCalledWith({ where: { id: "pub_1" } });
  });

  it("rejects a permalink that isn't a web link", async () => {
    const res = await post({ socialAccountId: "acc1", permalink: "javascript:alert(1)" });
    expect(res.status).toBe(400);
  });
});
