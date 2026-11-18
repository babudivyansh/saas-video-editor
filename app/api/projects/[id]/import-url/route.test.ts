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
const projectUpdate = vi.fn(async (..._args: unknown[]) => ({ count: 1 }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(async () => project),
      updateMany: (...args: unknown[]) => projectUpdate(...args),
    },
  },
}));

const store = new Map<string, string>();
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
  },
}));

const deleteS3Object = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/utils/s3-upload", () => ({
  deleteS3Object: (...args: unknown[]) => deleteS3Object(...args),
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
  UNSUPPORTED_LINK_MESSAGE: "That link isn't supported.",
}));

const adoptExistingS3Object = vi.fn(async () => ({ asset: {}, url: "x", key: "x", duplicate: false }));
vi.mock("@/lib/asset-service", () => ({
  adoptExistingS3Object: (...args: unknown[]) => (adoptExistingS3Object as unknown as (...a: unknown[]) => unknown)(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));

const { POST, GET } = await import("./route");
const flush = () => new Promise((r) => setTimeout(r, 0));

function importRequest(url = "https://youtube.com/watch?v=abc", extra: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/projects/p1/import-url", {
    method: "POST",
    body: JSON.stringify({ url, ...extra }),
  });
}
const ctx = { params: Promise.resolve({ id: "p1" }) };
const statusRequest = () => new NextRequest("http://localhost/api/projects/p1/import-url?status=1");

beforeEach(() => {
  authUser = { userId: "u1" };
  vi.clearAllMocks();
  store.clear();
  importSourceFromUrl.mockResolvedValue(importResult);
  projectUpdate.mockResolvedValue({ count: 1 });
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
      where: { id: "p1", userId: "u1", status: "draft" },
      data: { uploadedVideoUrl: importResult.url, title: importResult.title },
    });
  });
});

// CLIPIRO-WEB-15: the browser gave up on a long import and discarded the
// draft; the server then finished and `project.update` threw P2025, leaving
// the upload orphaned in S3.
describe("POST import-url — project deleted while downloading", () => {
  it("returns 409 and deletes the upload instead of throwing", async () => {
    projectUpdate.mockResolvedValueOnce({ count: 0 });
    const res = await POST(importRequest(), ctx);
    expect(res.status).toBe(409);
    expect(deleteS3Object).toHaveBeenCalledWith(importResult.key);
    expect(adoptExistingS3Object).not.toHaveBeenCalled();
  });
});

describe("background import (async: true) + GET ?status=1", () => {
  it("answers 202 at once, then reports done", async () => {
    let release!: () => void;
    importSourceFromUrl.mockImplementationOnce(() => new Promise((r) => { release = () => r(importResult); }));
    const res = await POST(importRequest(undefined, { async: true }), ctx);
    expect(res.status).toBe(202);

    expect(await (await GET(statusRequest(), ctx)).json()).toMatchObject({ state: "running" });
    release();
    await flush(); await flush();
    const done = await (await GET(statusRequest(), ctx)).json();
    expect(done).toMatchObject({ state: "done", url: importResult.url, title: importResult.title });
    expect(done.userId).toBeUndefined();
  });

  it("reports a user-facing failure message", async () => {
    const { UrlImportError } = await import("@/lib/url-import");
    importSourceFromUrl.mockRejectedValueOnce(new UrlImportError("That stream is still live."));
    await POST(importRequest(undefined, { async: true }), ctx);
    await flush(); await flush();
    expect(await (await GET(statusRequest(), ctx)).json()).toEqual({ state: "failed", error: "That stream is still live." });
  });

  it("reports the deleted project, and cleans up, when the draft is gone at the end", async () => {
    projectUpdate.mockResolvedValueOnce({ count: 0 });
    await POST(importRequest(undefined, { async: true }), ctx);
    await flush(); await flush();
    expect((await (await GET(statusRequest(), ctx)).json()).state).toBe("failed");
    expect(deleteS3Object).toHaveBeenCalledWith(importResult.key);
  });

  it("does not show another user's import", async () => {
    await POST(importRequest(undefined, { async: true }), ctx);
    authUser = { userId: "u2" };
    expect((await GET(statusRequest(), ctx)).status).toBe(404);
  });
});
