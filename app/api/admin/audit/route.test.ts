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
let groupByWhere: unknown;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      findMany: vi.fn(async ({ where }: { where: unknown }) => {
        findManyWhere = where;
        return [];
      }),
      count: vi.fn(async ({ where }: { where: unknown }) => {
        countWhere = where;
        return 0;
      }),
      groupBy: vi.fn(async ({ where }: { where: unknown }) => {
        groupByWhere = where;
        return [];
      }),
    },
    user: { findMany: vi.fn(async () => []) },
  },
}));

const { GET } = await import("./route");

function get(query: string) {
  return GET(new NextRequest(`http://localhost/api/admin/audit${query}`));
}

beforeEach(() => {
  findManyWhere = undefined;
  countWhere = undefined;
  groupByWhere = undefined;
  vi.clearAllMocks();
});

// OBS-1: the activity-summary groupBy used to hardcode its own independent
// 30-day-only `where`, so it could report a smaller (or just different)
// count than the detail table built from the active filters right above it.
// These pin the summary's `where` to always share the same base filters as
// the detail query, diverging only in the createdAt default.
describe("GET /api/admin/audit — activity summary stays in sync with the detail filters", () => {
  it("defaults the summary window to ~30 days when no explicit range is set", async () => {
    const before = Date.now();
    await get("");
    const gte = (groupByWhere as { createdAt: { gte: Date } }).createdAt.gte;
    const expectedGte = before - 30 * 86400_000;
    expect(gte.getTime()).toBeGreaterThanOrEqual(expectedGte - 5000);
    expect(gte.getTime()).toBeLessThanOrEqual(expectedGte + 5000);
  });

  it("carries an active action filter into every query — list, count, and summary alike", async () => {
    await get("?action=user.");
    expect(findManyWhere).toMatchObject({ action: { startsWith: "user." } });
    expect(countWhere).toMatchObject({ action: { startsWith: "user." } });
    expect(groupByWhere).toMatchObject({ action: { startsWith: "user." } });
  });

  it("carries an active targetId filter into the summary query", async () => {
    await get("?targetId=t1");
    expect(findManyWhere).toMatchObject({ targetId: "t1" });
    expect(groupByWhere).toMatchObject({ targetId: "t1" });
  });

  it("respects an explicit `from` beyond 30 days instead of silently clamping to 30 days", async () => {
    const oldFrom = "2020-01-01";
    await get(`?from=${oldFrom}`);
    const detailGte = (findManyWhere as { createdAt: { gte: Date } }).createdAt.gte;
    const summaryGte = (groupByWhere as { createdAt: { gte: Date } }).createdAt.gte;
    expect(summaryGte.getTime()).toBe(detailGte.getTime());
    expect(summaryGte.getFullYear()).toBe(2020);
  });

  it("respects an explicit `to` in the summary window as well as the detail window", async () => {
    await get("?to=2020-06-15");
    const detailLte = (findManyWhere as { createdAt: { lte: Date } }).createdAt.lte;
    const summaryLte = (groupByWhere as { createdAt: { lte: Date } }).createdAt.lte;
    expect(summaryLte.getTime()).toBe(detailLte.getTime());
  });

  it("returns activityWindow reflecting the summary's actual bounds", async () => {
    const res = await get("?from=2021-03-01&to=2021-03-10");
    const body = await res.json();
    expect(new Date(body.activityWindow.from).toISOString().slice(0, 10)).toBe("2021-03-01");
    expect(new Date(body.activityWindow.to).toISOString().slice(0, 10)).toBe("2021-03-10");
  });

  it("skips the summary query entirely on page 2 (unchanged behavior)", async () => {
    await get("?page=2");
    expect(groupByWhere).toBeUndefined();
  });
});
