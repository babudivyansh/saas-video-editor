import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// CLIPIRO-WEB-1D (2026-11-19): /api/admin/assets threw "Do not know how to
// serialize a BigInt" whenever an asset was flagged: the flagged rows were
// spread into the response with Asset.size still a BigInt.

vi.mock("@/lib/admin/api", () => ({
  withAdmin: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { admin: { id: "a1" }, params: {} }),
}));

const flaggedRow = {
  id: "as1", name: "clip.mp4", kind: "video", size: BigInt(3_000_000_000),
  moderationLabels: ["Violence"], createdAt: new Date("2026-11-19T00:00:00Z"), userId: "u1",
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: {
      aggregate: vi.fn(async () => ({ _sum: { size: BigInt(5_000_000_000) }, _count: 2 })),
      groupBy: vi.fn(async () => [{ userId: "u1", _sum: { size: BigInt(5_000_000_000) }, _count: 2 }]),
      findMany: vi.fn(async () => [flaggedRow]),
    },
    pendingUpload: { count: vi.fn(async () => 0) },
    user: { findMany: vi.fn(async () => [{ id: "u1", email: "u1@example.com", name: "U" }]) },
  },
}));

const { GET } = await import("./route");

describe("GET /api/admin/assets", () => {
  it("serialises flagged assets whose size is a BigInt", async () => {
    const res = await (GET as unknown as (req: NextRequest) => Promise<Response>)(new NextRequest("http://localhost/api/admin/assets"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.flaggedAssets[0]).toMatchObject({ id: "as1", size: 3_000_000_000, user: { email: "u1@example.com" } });
    expect(body.totalBytes).toBe(5_000_000_000);
  });
});
