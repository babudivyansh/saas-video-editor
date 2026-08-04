import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

vi.mock("@/lib/env", () => ({ env: { JWT_SECRET: "test-secret", NEXT_PUBLIC_APP_URL: "http://localhost:3000" } }));

type User = { userId: string; email: string; sessionId: string };
let subscriber: User | null = null;
let authUser: User | null = null;
vi.mock("@/lib/auth", () => ({
  requireSubscriber: vi.fn(async () => subscriber),
  getAuthUser: vi.fn(async () => authUser),
}));

interface AccountRow { id: string; userId: string }
interface LinkRow {
  id: string; userId: string; jti: string; accountIds: string[];
  expiresAt: Date; revokedAt: Date | null;
}
let accountRows: AccountRow[] = [];
let linkRows: LinkRow[] = [];
let activeCount = 0;

const createLink = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
  id: "link_new", createdAt: new Date(), sections: [], ...data,
}));
const updateLink = vi.fn(async () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    socialAccount: {
      findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] }; userId: string } }) =>
        accountRows.filter((a) => a.userId === where.userId && (!where.id?.in || where.id.in.includes(a.id))),
      ),
    },
    socialReportLink: {
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
        linkRows.filter((l) => l.userId === where.userId),
      ),
      findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) =>
        linkRows.find((l) => l.id === where.id && l.userId === where.userId) ?? null,
      ),
      count: vi.fn(async () => activeCount),
      create: createLink,
      update: updateLink,
    },
  },
}));

const redisSet = vi.fn(async () => {});
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async () => null),
    set: (...args: unknown[]) => redisSet(...(args as [])),
    del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true, remaining: 0 })) }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { GET, POST } = await import("./route");
const { DELETE } = await import("./[id]/route");

const ALICE: User = { userId: "user_alice", email: "a@x.com", sessionId: "s1" };
const ALICE_ACC = "clxaliceaccount01";
const BOB_ACC = "clxbobaccount0001";

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/social/report-link", { method: "POST", body: JSON.stringify(body) }));
const del = (id: string) =>
  DELETE(new NextRequest(`http://localhost/api/social/report-link/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  subscriber = ALICE;
  authUser = ALICE;
  activeCount = 0;
  createLink.mockClear();
  updateLink.mockClear();
  redisSet.mockClear();
  accountRows = [
    { id: ALICE_ACC, userId: ALICE.userId },
    { id: BOB_ACC, userId: "user_bob" },
  ];
  linkRows = [
    {
      id: "link_alice", userId: ALICE.userId, jti: "jti-alice", accountIds: [ALICE_ACC],
      expiresAt: new Date(Date.now() + 3 * 86_400_000), revokedAt: null,
    },
    {
      id: "link_bob", userId: "user_bob", jti: "jti-bob", accountIds: [BOB_ACC],
      expiresAt: new Date(Date.now() + 86_400_000), revokedAt: null,
    },
  ];
});

describe("POST /api/social/report-link", () => {
  it("404s when asked to share another tenant's account", async () => {
    expect((await post({ accountIds: [BOB_ACC] })).status).toBe(404);
    expect(createLink).not.toHaveBeenCalled();
  });

  it("mints a token carrying only a jti — the scope lives in the row", async () => {
    // The old token carried the accountId and could not be revoked; a leaked
    // link stayed live for a week with no kill switch short of rotating
    // JWT_SECRET, which signs out every user in the product.
    const body = await (await post({ accountIds: [ALICE_ACC] })).json();
    const token = body.data.url.split("/").pop() as string;
    const payload = jwt.decode(token) as Record<string, unknown>;
    expect(payload.jti).toEqual(expect.any(String));
    expect(payload).not.toHaveProperty("accountId");
    expect(createLink.mock.calls[0][0].data.accountIds).toEqual([ALICE_ACC]);
  });

  it("409s past the active-link cap instead of minting forever", async () => {
    activeCount = 20;
    expect((await post({ accountIds: [ALICE_ACC] })).status).toBe(409);
  });

  it("400s on an expiry beyond the maximum", async () => {
    expect((await post({ accountIds: [ALICE_ACC], expiresInDays: 400 })).status).toBe(400);
  });

  it("never returns the jti in the listing", async () => {
    await GET(new NextRequest("http://localhost/api/social/report-link"));
    const { prisma } = await import("@/lib/prisma");
    const select = vi.mocked(prisma.socialReportLink.findMany).mock.calls[0][0]!.select!;
    expect(select).not.toHaveProperty("jti");
    expect(select).toHaveProperty("viewCount");
  });
});

describe("DELETE /api/social/report-link/[id]", () => {
  it("404s on another tenant's link", async () => {
    expect((await del("link_bob")).status).toBe(404);
    expect(updateLink).not.toHaveBeenCalled();
  });

  it("revokes in the row and in the denylist, so it takes effect immediately", async () => {
    const res = await del("link_alice");
    expect(res.status).toBe(200);
    expect(updateLink.mock.calls[0][0].data.revokedAt).toBeInstanceOf(Date);
    expect(redisSet).toHaveBeenCalledWith(
      "social:revoked-jti:jti-alice",
      "1",
      "EX",
      // TTL is the token's REMAINING life: longer is waste, shorter reopens a
      // window where a revoked token works again.
      expect.any(Number),
    );
    const ttl = redisSet.mock.calls[0][3] as unknown as number;
    expect(ttl).toBeGreaterThan(2 * 86_400);
    expect(ttl).toBeLessThanOrEqual(3 * 86_400);
  });

  it("treats an already-revoked link as success", async () => {
    // The caller wanted it off and it is off. Reporting failure would invite a
    // panicked second attempt.
    linkRows[0].revokedAt = new Date();
    const res = await del("link_alice");
    expect(res.status).toBe(200);
    expect((await res.json()).data.alreadyRevoked).toBe(true);
  });

  it("still revokes when Redis is unavailable", async () => {
    redisSet.mockRejectedValueOnce(new Error("redis down"));
    expect((await del("link_alice")).status).toBe(200);
    expect(updateLink).toHaveBeenCalled();
  });

  it("lets a lapsed subscriber revoke a link they published", async () => {
    // Locking someone out of shutting off their own share link because their
    // card expired would be indefensible.
    subscriber = null;
    expect((await del("link_alice")).status).toBe(200);
  });
});
