// GET /api/assets — the library listing.
//
// Two things worth pinning here. Cursor pagination over a non-unique sort key
// is non-deterministic on ties, so paging by name across several files called
// "clip.mp4" silently skipped rows and repeated others. And the response used
// to spread the raw Prisma row, shipping s3Key, the SHA-256 checksum, the
// legacy permanent url column and the raw moderation labels to the browser.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string } | null = { userId: "u1" };
vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => authUser),
  getUserTier: vi.fn(async () => "free"),
}));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }));
vi.mock("@/lib/plans/tiers", () => ({
  storageLimitBytesForTier: () => 1024,
  maxUploadBytesForTier: () => 512,
}));
vi.mock("@/utils/s3-upload", () => ({
  getAssetReadUrl: vi.fn(async (key: string) => `https://signed.example/${key}`),
}));

function assetRow(over: Record<string, unknown> = {}) {
  return {
    id: "a1",
    userId: "u1",
    name: "clip.mp4",
    s3Key: "uploads/u1/secret-object-path.mp4",
    url: "https://legacy.example/permanent.mp4",
    mimeType: "video/mp4",
    kind: "video",
    size: 100,
    duration: 12,
    width: null,
    height: null,
    folderId: null,
    isFavorite: false,
    archivedAt: null,
    thumbnailS3Key: null,
    checksum: "deadbeefchecksum",
    moderationStatus: "clean",
    moderationLabels: { labels: [{ name: "Sensitive" }] },
    sourceFeature: "upload",
    sourceProjectId: null,
    sourceClipId: null,
    sourceJobId: null,
    status: "ready",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    folder: null,
    tags: [],
    ...over,
  };
}

let rows: ReturnType<typeof assetRow>[] = [];
let lastArgs: { where?: Record<string, unknown>; orderBy?: unknown; take?: number } = {};
const findMany = vi.fn(async (args: typeof lastArgs) => {
  lastArgs = args;
  return rows;
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: {
      findMany: (a: never) => findMany(a),
      aggregate: vi.fn(async () => ({ _sum: { size: 0 }, _count: 0 })),
      groupBy: vi.fn(async () => []),
    },
  },
}));

const { GET } = await import("./route");
const req = (qs = "") => new NextRequest(`http://localhost/api/assets${qs}`);

beforeEach(() => {
  authUser = { userId: "u1" };
  rows = [assetRow()];
  lastArgs = {};
  vi.clearAllMocks();
});

describe("GET /api/assets — cursor stability", () => {
  // Postgres gives no stable ordering for equal keys, so the unique column has
  // to be part of the sort or a cursor walks the list unpredictably.
  it.each([
    ["date", "createdAt"],
    ["oldest", "createdAt"],
    ["name", "name"],
    ["size", "size"],
    ["duration", "duration"],
  ])("breaks ties by id for sort=%s", async (sort, field) => {
    await GET(req(`?sort=${sort}`));
    const orderBy = lastArgs.orderBy as Array<Record<string, string>>;
    expect(Array.isArray(orderBy)).toBe(true);
    expect(Object.keys(orderBy[0])[0]).toBe(field);
    expect(orderBy[orderBy.length - 1]).toEqual({ id: "asc" });
  });
});

describe("GET /api/assets — response shape", () => {
  it("never leaks internal storage or moderation internals", async () => {
    const body = await (await GET(req())).json();
    const asset = body.assets[0];

    for (const leak of ["s3Key", "checksum", "moderationLabels", "userId", "thumbnailS3Key", "folderId"]) {
      expect(asset).not.toHaveProperty(leak);
    }
    // The legacy permanent url column must not be served either — reads go
    // through a freshly signed URL derived from s3Key.
    expect(asset.url).not.toBe("https://legacy.example/permanent.mp4");
    expect(asset.url).toContain("signed.example");
  });

  it("still serves everything the UI and the shared picker need", async () => {
    const body = await (await GET(req())).json();
    const asset = body.assets[0];
    for (const field of [
      "id", "name", "url", "thumbnailUrl", "kind", "mimeType",
      "duration", "size", "createdAt", "status", "moderationStatus",
    ]) {
      expect(asset).toHaveProperty(field);
    }
  });

  it("flattens tags to plain {id,name} pairs", async () => {
    rows = [assetRow({ tags: [{ tag: { id: "t1", name: "hook" } }] })];
    const body = await (await GET(req())).json();
    expect(body.assets[0].tags).toEqual([{ id: "t1", name: "hook" }]);
  });
});

describe("GET /api/assets — filtering", () => {
  it("401s when unauthenticated", async () => {
    authUser = null;
    expect((await GET(req())).status).toBe(401);
  });

  it("always scopes to the caller", async () => {
    await GET(req());
    expect(lastArgs.where).toMatchObject({ userId: "u1" });
  });

  // The picker sends this. Without it a moderation-flagged asset — hidden
  // behind an "Under review" tile in the library — was still fully selectable
  // by every feature that opens the picker.
  it("excludes flagged assets when asked", async () => {
    await GET(req("?excludeFlagged=true"));
    expect(lastArgs.where).toMatchObject({ moderationStatus: { not: "flagged" } });
  });

  it("does not exclude flagged assets by default — the library shows them", async () => {
    await GET(req());
    expect(lastArgs.where).not.toHaveProperty("moderationStatus");
  });

  it("treats folderId=none as unfiled rather than as a folder id", async () => {
    await GET(req("?folderId=none"));
    expect(lastArgs.where).toMatchObject({ folderId: null });
  });

  it("caps the page size", async () => {
    await GET(req("?limit=9999"));
    expect(lastArgs.take).toBe(101);
  });
});
