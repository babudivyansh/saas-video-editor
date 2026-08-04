import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

const SECRET = "test-secret";
vi.mock("@/lib/env", () => ({ env: { JWT_SECRET: "test-secret", NEXT_PUBLIC_APP_URL: "http://localhost:3000" } }));

let denylist = new Map<string, string>();
let redisThrows = false;
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (k: string) => {
      if (redisThrows) throw new Error("redis down");
      return denylist.get(k) ?? null;
    }),
    set: vi.fn(async () => {}),
    del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

interface LinkRow {
  id: string; userId: string; accountIds: string[]; sections: string[];
  expiresAt: Date; revokedAt: Date | null;
}
let links: LinkRow[] = [];
const updateLink = vi.fn(async () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    socialReportLink: {
      findUnique: vi.fn(async ({ where }: { where: { jti: string } }) =>
        links.find((l) => l.id === where.jti.replace("jti-", "link-")) ?? null,
      ),
      update: updateLink,
    },
  },
}));

const { verifyReportLink, recordLinkView } = await import("./report-link");

const sign = (payload: object, expiresIn: string | number = "7d") =>
  jwt.sign(payload, SECRET, { expiresIn: expiresIn as jwt.SignOptions["expiresIn"] });

beforeEach(() => {
  denylist = new Map();
  redisThrows = false;
  updateLink.mockClear();
  links = [
    {
      id: "link-1", userId: "u1", accountIds: ["acc1"], sections: ["kpis"],
      expiresAt: new Date(Date.now() + 86_400_000), revokedAt: null,
    },
  ];
});

describe("verifyReportLink", () => {
  it("accepts a live link and returns the scope from the row, not the token", async () => {
    const result = await verifyReportLink(sign({ jti: "jti-1", purpose: "social-report" }));
    expect(result).toMatchObject({ ok: true, link: { id: "link-1", accountIds: ["acc1"] } });
  });

  it("rejects a revoked link even though the token still verifies", async () => {
    // The entire point of the change: revocation must beat a cryptographically
    // valid token.
    links[0].revokedAt = new Date();
    const result = await verifyReportLink(sign({ jti: "jti-1", purpose: "social-report" }));
    expect(result).toEqual({ ok: false, reason: "revoked" });
  });

  it("rejects instantly from the denylist, without consulting the row", async () => {
    denylist.set("social:revoked-jti:jti-1", "1");
    expect(await verifyReportLink(sign({ jti: "jti-1", purpose: "social-report" }))).toEqual({
      ok: false,
      reason: "revoked",
    });
  });

  it("still enforces revocation when Redis is unavailable", async () => {
    // Redis will be down at some point; the row is the authority precisely so
    // that a cache outage cannot un-revoke every link in the product.
    redisThrows = true;
    links[0].revokedAt = new Date();
    expect(await verifyReportLink(sign({ jti: "jti-1", purpose: "social-report" }))).toEqual({
      ok: false,
      reason: "revoked",
    });
  });

  it("distinguishes expired from invalid, because the user action differs", async () => {
    expect(await verifyReportLink(sign({ jti: "jti-1", purpose: "social-report" }, "-1s"))).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(await verifyReportLink("not-a-token")).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a token signed for another purpose", async () => {
    expect(await verifyReportLink(sign({ jti: "jti-1", purpose: "password-reset" }))).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects the old unrevocable token shape", async () => {
    // Legacy tokens carried accountId and have no row. Honouring them would
    // keep alive exactly the links this change exists to end.
    expect(await verifyReportLink(sign({ accountId: "acc1", purpose: "social-report" }))).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("rejects a token whose row expired even if the JWT has not", async () => {
    links[0].expiresAt = new Date(Date.now() - 1000);
    expect(await verifyReportLink(sign({ jti: "jti-1", purpose: "social-report" }))).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("rejects a token whose row was deleted", async () => {
    links = [];
    expect(await verifyReportLink(sign({ jti: "jti-1", purpose: "social-report" }))).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

describe("recordLinkView", () => {
  it("never throws — the audit trail must not be able to break the page", async () => {
    updateLink.mockRejectedValueOnce(new Error("db down"));
    await expect(recordLinkView("link-1")).resolves.toBeUndefined();
  });
});
