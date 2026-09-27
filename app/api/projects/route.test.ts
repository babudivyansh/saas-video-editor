// GET /api/projects — the ?cover=1 variant the clips library's Projects tab
// uses. It must stay opt-in (other callers keep their payload) and must only
// ever hand out re-signed media URLs.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1" })) }));
vi.mock("@/lib/dashboard-summary-cache", () => ({ invalidateDashboardSummary: vi.fn() }));

const getAssetReadUrl = vi.fn(async (key: string) => `https://signed.example/${key}?sig=xyz`);
vi.mock("@/utils/s3-upload", () => ({ getAssetReadUrl }));

const S3 = "https://bucket.s3.ap-south-1.amazonaws.com";
let lastArgs: { where?: unknown; include?: Record<string, unknown> } = {};
let rows: Record<string, unknown>[] = [];
const findMany = vi.fn(async (args: typeof lastArgs) => {
  lastArgs = args;
  return rows;
});
vi.mock("@/lib/prisma", () => ({ prisma: { project: { findMany: (a: never) => findMany(a) } } }));

const { GET } = await import("./route");
const req = (qs = "") => new NextRequest(`http://localhost/api/projects${qs}`);

beforeEach(() => {
  lastArgs = {};
  rows = [{ id: "p1", title: "Run", uploadedVideoUrl: `${S3}/uploads/u1/src.mp4`, _count: { clips: 2 }, clips: [{ thumbnailUrl: `${S3}/renders/p1/clip-0.jpg` }] }];
  vi.clearAllMocks();
});

describe("GET /api/projects", () => {
  it("does not load or sign media unless asked", async () => {
    await GET(req("?productType=auto-clip"));
    expect(lastArgs.include).not.toHaveProperty("clips");
    expect(getAssetReadUrl).not.toHaveBeenCalled();
  });

  it("with ?cover=1 returns a signed cover and source, and drops the raw clip rows", async () => {
    const body = await (await GET(req("?productType=auto-clip&cover=1"))).json();
    expect(lastArgs.where).toMatchObject({ userId: "u1", productType: "auto-clip" });
    expect(body.projects[0].coverUrl).toBe("https://signed.example/renders/p1/clip-0.jpg?sig=xyz");
    expect(body.projects[0].sourceUrl).toBe("https://signed.example/uploads/u1/src.mp4?sig=xyz");
    expect(body.projects[0]).not.toHaveProperty("clips");
  });

  it("gives a null cover to a run with no rendered clip", async () => {
    rows = [{ id: "p2", title: "Draft", uploadedVideoUrl: null, _count: { clips: 0 }, clips: [] }];
    const body = await (await GET(req("?cover=1"))).json();
    expect(body.projects[0].coverUrl).toBeNull();
    expect(body.projects[0].sourceUrl).toBeNull();
  });
});
