import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Regression coverage for the Global Asset Library gap: URL-imported AutoClip
// sources used to only ever set Project.uploadedVideoUrl and were invisible
// to the Assets library. adoptExistingS3Object must now be called for every
// successful import, and — being best-effort — its failure must never turn a
// successful import into an error response.

let authUser: { userId: string } | null = { userId: "u1" };
vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => authUser),
  getUserTier: vi.fn(async () => "creator"),
}));

const project = { id: "p1", userId: "u1", status: "draft" };
const projectUpdate = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(async () => project),
      update: (...args: unknown[]) => (projectUpdate as unknown as (...a: unknown[]) => unknown)(...args),
    },
  },
}));

const importResult = {
  url: "https://bucket.example.s3.amazonaws.com/uploads/u1/p1-abc.mp4",
  key: "uploads/u1/p1-abc.mp4",
  title: "My Podcast Episode",
  durationSec: 600,
  bytes: 50 * 1024 * 1024,
};
const importSourceFromUrl = vi.fn(async () => importResult);
vi.mock("@/lib/url-import", () => ({
  importSourceFromUrl: (...args: unknown[]) => (importSourceFromUrl as unknown as (...a: unknown[]) => unknown)(...args),
  UrlImportError: class UrlImportError extends Error {},
  probeSourceUrl: vi.fn(),
  isAllowedSourceUrl: vi.fn(() => true),
}));

const adoptExistingS3Object = vi.fn(async () => ({ asset: {}, url: "x", key: "x", duplicate: false }));
vi.mock("@/lib/asset-service", () => ({
  adoptExistingS3Object: (...args: unknown[]) => (adoptExistingS3Object as unknown as (...a: unknown[]) => unknown)(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));

const { POST } = await import("./route");
const flush = () => new Promise((r) => setTimeout(r, 0));

function importRequest(url = "https://youtube.com/watch?v=abc") {
  return new NextRequest("http://localhost/api/projects/p1/import-url", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

beforeEach(() => {
  authUser = { userId: "u1" };
  vi.clearAllMocks();
  importSourceFromUrl.mockResolvedValue(importResult);
});

describe("POST /api/projects/[id]/import-url — Global Asset Library adoption", () => {
  it("adopts the imported source as an Asset tagged url-import, scoped to this project", async () => {
    const res = await POST(importRequest(), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(200);
    await flush();

    expect(adoptExistingS3Object).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        s3Key: importResult.key,
        sourceFeature: "url-import",
        sourceProjectId: "p1",
        size: importResult.bytes,
      }),
    );
  });

  it("still returns success even if asset adoption fails (non-fatal, best-effort)", async () => {
    adoptExistingS3Object.mockRejectedValueOnce(new Error("quota exceeded"));
    const res = await POST(importRequest(), { params: Promise.resolve({ id: "p1" }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.url).toBe(importResult.url);
    await flush(); // let the rejected promise's .catch settle without an unhandled rejection
  });

  it("still updates the project's source video regardless of asset adoption outcome", async () => {
    await POST(importRequest(), { params: Promise.resolve({ id: "p1" }) });
    expect(projectUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { uploadedVideoUrl: importResult.url, title: importResult.title },
    });
  });
});
