import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ userId: "admin-1", email: "admin@test.co" })),
}));
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (key: string) => (key.startsWith("admin-elevated:") ? "1" : null)),
    set: vi.fn(async () => {}),
    del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

let findManyWhere: unknown;
let countWhere: unknown;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    affiliate: {
      findMany: vi.fn(async ({ where }: { where: unknown }) => {
        findManyWhere = where;
        return [];
      }),
      count: vi.fn(async ({ where }: { where: unknown } = { where: undefined }) => {
        countWhere = where;
        return 0;
      }),
    },
    commission: { groupBy: vi.fn(async () => []) },
    referral: { groupBy: vi.fn(async () => []) },
  },
}));

const { GET } = await import("./route");

function get(query: string) {
  return GET(new NextRequest(`http://localhost/api/admin/affiliates${query}`));
}

beforeEach(() => {
  findManyWhere = undefined;
  countWhere = undefined;
  vi.clearAllMocks();
});

describe("GET /api/admin/affiliates", () => {
  it("applies no filter by default", async () => {
    const res = await get("");
    expect(res.status).toBe(200);
    expect(findManyWhere).toEqual({});
    expect(countWhere).toEqual({});
  });

  it("narrows by status", async () => {
    await get("?status=banned");
    expect(findManyWhere).toEqual({ status: "banned" });
  });

  it("narrows by free-text search across code, email, and name", async () => {
    await get("?search=divyansh");
    expect(findManyWhere).toEqual({
      OR: [
        { code: { contains: "divyansh", mode: "insensitive" } },
        { user: { email: { contains: "divyansh", mode: "insensitive" } } },
        { user: { name: { contains: "divyansh", mode: "insensitive" } } },
      ],
    });
  });

  it("combines status and search", async () => {
    await get("?status=active&search=foo");
    expect(findManyWhere).toMatchObject({ status: "active", OR: expect.any(Array) });
  });

  it("treats an empty search string as no filter", async () => {
    await get("?search=");
    expect(findManyWhere).toEqual({});
  });
});
