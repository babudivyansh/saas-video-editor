import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The tile and the cards used to read different populations — the "Active
// projects" count included every product type and every empty draft while the
// cards below filtered to auto-clip/editor and capped at 5, so a user could be
// shown "15 active" above five cards with no way to reach the rest.

let authUser: { userId: string } | null;
let redisStore: Map<string, string>;
let capturedWhere: Record<string, unknown> | null;
let capturedOrderBy: unknown;

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));

interface Row {
  id: string;
  title: string;
  status: string;
  progress: number;
  productType: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { clips: number };
}

let projectRows: Row[];
let completedCount: number;
let totalCount: number;
let clipCount: number;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.status === "completed") return completedCount;
        // The resumable count carries the started-signal OR clause; the plain
        // total does not.
        if ("OR" in where) {
          capturedWhere = where;
          return projectRows.length;
        }
        return totalCount;
      }),
      findMany: vi.fn(async ({ where, orderBy, take }: { where: Record<string, unknown>; orderBy: unknown; take: number }) => {
        capturedWhere = where;
        capturedOrderBy = orderBy;
        return projectRows.slice(0, take);
      }),
    },
    clip: { count: vi.fn(async () => clipCount) },
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (k: string) => redisStore.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => { redisStore.set(k, v); }),
  },
}));

import { GET } from "./route";

const req = () => new NextRequest("http://localhost/api/dashboard/summary");

function row(over: Partial<Row> = {}): Row {
  return {
    id: over.id ?? "p1",
    title: over.title ?? "A project",
    status: over.status ?? "draft",
    progress: over.progress ?? 0,
    productType: over.productType ?? "auto-clip",
    createdAt: over.createdAt ?? new Date("2026-01-01"),
    updatedAt: over.updatedAt ?? new Date("2026-01-02"),
    _count: over._count ?? { clips: 0 },
  };
}

beforeEach(() => {
  authUser = { userId: "u1" };
  redisStore = new Map();
  capturedWhere = null;
  capturedOrderBy = null;
  projectRows = [];
  completedCount = 0;
  totalCount = 0;
  clipCount = 0;
  vi.clearAllMocks();
});

describe("GET /api/dashboard/summary", () => {
  it("401s without a session", async () => {
    authUser = null;
    expect((await GET(req())).status).toBe(401);
  });

  it("orders the rail by last edited, not newest created", async () => {
    projectRows = [row()];
    await GET(req());
    expect(capturedOrderBy).toEqual({ updatedAt: "desc" });
  });

  it("restricts the rail to resumable product types that show signs of work", async () => {
    projectRows = [row()];
    await GET(req());

    expect(capturedWhere).toMatchObject({
      userId: "u1",
      productType: { in: ["auto-clip", "editor"] },
    });
    // The started-signal clause is what keeps never-touched shells out.
    expect(Array.isArray((capturedWhere as { OR?: unknown[] }).OR)).toBe(true);
  });

  it("reports activeProjects from the same population as the cards", async () => {
    projectRows = Array.from({ length: 8 }, (_, i) => row({ id: `p${i}` }));
    totalCount = 20;

    const body = await (await GET(req())).json();

    // Cards are capped at 5, but the tile and inProgressTotal report the full
    // resumable count so the UI can offer "view all" instead of hiding them.
    expect(body.inProgress).toHaveLength(5);
    expect(body.stats.activeProjects).toBe(8);
    expect(body.inProgressTotal).toBe(8);
  });

  it("exposes updatedAt so editor projects can show when they were last edited", async () => {
    projectRows = [row({ productType: "editor", updatedAt: new Date("2026-03-04T05:06:07Z") })];

    const body = await (await GET(req())).json();

    expect(body.inProgress[0].updatedAt).toBe("2026-03-04T05:06:07.000Z");
  });

  it("still reports totals across every project, not just resumable ones", async () => {
    totalCount = 20;
    completedCount = 2;
    clipCount = 3;

    const body = await (await GET(req())).json();

    expect(body.stats.totalProjects).toBe(20);
    expect(body.stats.completedProjects).toBe(2);
    expect(body.stats.totalClips).toBe(3);
    expect(body.hasAnyProjects).toBe(true);
  });

  it("serves the cached payload on a second call", async () => {
    totalCount = 1;
    const first = await (await GET(req())).json();
    const second = await (await GET(req())).json();
    expect(second).toEqual(first);
    expect(redisStore.has("dash-summary:u1")).toBe(true);
  });
});
