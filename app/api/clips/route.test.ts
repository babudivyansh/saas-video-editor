// GET /api/clips — the cross-project clip listing that makes a real "My Clips"
// page possible. Clip has no userId of its own, so ownership has to travel
// through the project relation on every query; these tests pin that, plus the
// cursor stability and thumbnail re-signing the listing depends on.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string } | null = { userId: "u1" };
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }));

const getAssetReadUrl = vi.fn(async (key: string) => `https://signed.example/${key}?sig=xyz`);
vi.mock("@/utils/s3-upload", () => ({ getAssetReadUrl }));

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "c1",
    projectId: "p1",
    index: 0,
    title: "Clip one",
    score: 80,
    status: "ready",
    progress: 100,
    isFavorite: false,
    durationSec: 20,
    startSec: 0,
    endSec: 20,
    aspectRatio: "9:16",
    thumbnailUrl: null,
    failureReason: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    project: { title: "Run", status: "completed" },
    ...over,
  };
}

let rows: ReturnType<typeof row>[] = [];
let lastArgs: { where?: unknown; orderBy?: unknown; take?: number; cursor?: unknown } = {};

const findMany = vi.fn(async (args: typeof lastArgs) => {
  lastArgs = args;
  return rows;
});
vi.mock("@/lib/prisma", () => ({ prisma: { clip: { findMany: (a: never) => findMany(a) } } }));

const { GET } = await import("./route");

const req = (qs = "") => new NextRequest(`http://localhost/api/clips${qs}`);

beforeEach(() => {
  authUser = { userId: "u1" };
  rows = [row()];
  lastArgs = {};
  vi.clearAllMocks();
});

describe("GET /api/clips", () => {
  it("401s when unauthenticated", async () => {
    authUser = null;
    expect((await GET(req())).status).toBe(401);
  });

  it("anchors ownership through the project relation, never as a post-filter", async () => {
    await GET(req());
    expect(lastArgs.where).toMatchObject({ project: { userId: "u1" } });
  });

  it("keeps the owner anchor when narrowing to one project", async () => {
    await GET(req("?projectId=p9"));
    // Both conditions live in the same relation filter — asking for a project
    // id must not replace the ownership check with it.
    expect(lastArgs.where).toMatchObject({ project: { userId: "u1", id: "p9" } });
  });

  // A cursor over a non-unique sort key skips or repeats rows whenever values
  // tie — the same latent defect the assets list has with name/size sorts.
  it.each([
    ["date", "createdAt"],
    ["oldest", "createdAt"],
    ["score", "score"],
    ["duration", "durationSec"],
  ])("breaks ties by id for sort=%s so paging is stable", async (sort, field) => {
    await GET(req(`?sort=${sort}`));
    const orderBy = lastArgs.orderBy as Array<Record<string, string>>;
    expect(Object.keys(orderBy[0])[0]).toBe(field);
    expect(orderBy[orderBy.length - 1]).toEqual({ id: "asc" });
  });

  it("caps the page size no matter what the caller asks for", async () => {
    await GET(req("?limit=5000"));
    expect(lastArgs.take).toBe(61); // 60 cap + 1 lookahead
  });

  it("falls back to a sane page size when limit is not a number", async () => {
    await GET(req("?limit=banana"));
    expect(lastArgs.take).toBe(31);
  });

  it("returns a nextCursor only when another page exists", async () => {
    rows = [row()];
    const body = await (await GET(req("?limit=1"))).json();
    expect(body.nextCursor).toBeNull();

    rows = [row({ id: "a" }), row({ id: "b" })];
    const paged = await (await GET(req("?limit=1"))).json();
    expect(paged.clips).toHaveLength(1);
    expect(paged.nextCursor).toBe("a");
  });

  // Renders are persisted with permanent unsigned S3 URLs. Handing those to a
  // listing gives out a durable link to possibly-unreleased content.
  it("re-signs stored thumbnails", async () => {
    rows = [row({ thumbnailUrl: "https://bucket.s3.ap-south-1.amazonaws.com/renders/p1/clip-0.jpg" })];
    const body = await (await GET(req())).json();

    expect(getAssetReadUrl).toHaveBeenCalledWith("renders/p1/clip-0.jpg");
    expect(body.clips[0].thumbnailUrl).toContain("sig=xyz");
  });

  it("passes through a thumbnail it cannot parse rather than dropping it", async () => {
    rows = [row({ thumbnailUrl: "https://cdn.example.com/t.jpg" })];
    const body = await (await GET(req())).json();
    expect(body.clips[0].thumbnailUrl).toBe("https://cdn.example.com/t.jpg");
  });

  it("keeps the thumbnail when re-signing fails instead of losing the image", async () => {
    getAssetReadUrl.mockRejectedValueOnce(new Error("s3 down"));
    const original = "https://bucket.s3.ap-south-1.amazonaws.com/renders/p1/clip-0.jpg";
    rows = [row({ thumbnailUrl: original })];

    const body = await (await GET(req())).json();
    expect(body.clips[0].thumbnailUrl).toBe(original);
  });

  it("applies the status, favourite, score and search filters", async () => {
    await GET(req("?status=ready&favorite=true&minScore=70&q=hook"));
    expect(lastArgs.where).toMatchObject({
      status: "ready",
      isFavorite: true,
      score: { gte: 70 },
      title: { contains: "hook", mode: "insensitive" },
    });
  });

  it("ignores a non-numeric minScore rather than filtering everything out", async () => {
    await GET(req("?minScore=abc"));
    expect(lastArgs.where).not.toHaveProperty("score");
  });

  it("surfaces the failure reason so a failed clip can explain itself", async () => {
    rows = [row({ status: "failed", failureReason: "Video is too short for a clip." })];
    const body = await (await GET(req())).json();
    expect(body.clips[0].failureReason).toBe("Video is too short for a clip.");
  });
});
