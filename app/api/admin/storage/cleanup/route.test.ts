import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin/api", async () => {
  const real = await vi.importActual<typeof import("@/lib/api-handler")>("@/lib/api-handler");
  return {
    parseBody: real.parseBody,
    withAdmin: (handler: (req: NextRequest, ctx: { admin: { userId: string } }) => Promise<Response>) =>
      async (req: NextRequest) => {
        try {
          return await handler(req, { admin: { userId: "admin1" } });
        } catch (e) {
          return real.mapHandlerError("test", req, e);
        }
      },
  };
});
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
const audit = vi.fn();
vi.mock("@/lib/admin/audit", () => ({ auditAdminAction: (...a: unknown[]) => audit(...a), auditIp: () => "127.0.0.1" }));

const old = new Date(Date.now() - 40 * 24 * 3600 * 1000);
const archived = [
  { id: "a1", name: "clip.mp4", s3Key: "k1", thumbnailS3Key: "t1", size: 1000, createdAt: old },
  { id: "a2", name: "b.png", s3Key: "k2", thumbnailS3Key: null, size: 500, createdAt: old },
];
const assetDelete = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: { findMany: vi.fn(async () => archived), delete: (...a: unknown[]) => assetDelete(...(a as [])) },
    pendingUpload: { findMany: vi.fn(async () => []), delete: vi.fn() },
  },
}));
const s3Delete = vi.fn(async () => {});
vi.mock("@/utils/s3-upload", () => ({ deleteS3Object: (...a: unknown[]) => s3Delete(...(a as [])), abortMultipartUpload: vi.fn() }));

const { POST } = await import("./route");
const post = (body: unknown) => POST(new NextRequest("http://x/api/admin/storage/cleanup", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => vi.clearAllMocks());

describe("POST /api/admin/storage/cleanup", () => {
  it("previews without deleting anything", async () => {
    const body = await (await post({ job: "retention", dryRun: true })).json();
    expect(body).toMatchObject({ dryRun: true, matched: 2, deleted: 0, bytes: 1500 });
    expect(s3Delete).not.toHaveBeenCalled();
    expect(assetDelete).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith("admin1", "storage.retention_previewed", undefined, expect.anything());
  });

  it("refuses a real run without the job name typed and a reason", async () => {
    expect((await post({ job: "retention", dryRun: false })).status).toBe(400);
    expect((await post({ job: "retention", dryRun: false, confirmPhrase: "orphans", reason: "tidy" })).status).toBe(400);
    expect((await post({ job: "retention", dryRun: false, confirmPhrase: "retention" })).status).toBe(400);
    expect(s3Delete).not.toHaveBeenCalled();
  });

  it("runs for real with the phrase, deleting files then rows", async () => {
    const body = await (await post({ job: "retention", dryRun: false, confirmPhrase: "retention", reason: "bucket cost" })).json();
    expect(body).toMatchObject({ dryRun: false, matched: 2, deleted: 2, failed: 0 });
    expect(s3Delete).toHaveBeenCalledWith("k1");
    expect(s3Delete).toHaveBeenCalledWith("t1");
    expect(assetDelete).toHaveBeenCalledTimes(2);
  });
});
