// getApiKeyAuth / revokeAllApiKeys — the public-API trust boundary. A key
// must fail closed once its owner is suspended or deactivated (login is
// blocked for those accounts; a key used to keep working regardless).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import { NextRequest } from "next/server";

process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";

type Row = {
  id: string; userId: string; scopes: string[]; revokedAt: Date | null; expiresAt: Date | null;
  user: { suspendedAt: Date | null; deactivatedAt: Date | null } | null;
};
let rows: Map<string, Row>;
const updateMany = vi.hoisted(() => vi.fn(async () => ({ count: 2 })));

vi.mock("@/lib/redis", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findUnique: vi.fn(async ({ where }: { where: { keyHash: string } }) => rows.get(where.keyHash) ?? null),
      update: vi.fn(async () => ({})),
      updateMany,
    },
  },
}));

const { getApiKeyAuth, generateApiKey, revokeAllApiKeys } = await import("@/lib/auth");

const hash = (k: string) => createHash("sha256").update(k).digest("hex");
const req = (key: string) => new NextRequest("http://localhost/api/v1/projects", { headers: { authorization: `Bearer ${key}` } });

let key: string;
beforeEach(() => {
  vi.clearAllMocks();
  rows = new Map();
  key = generateApiKey().plaintext;
  rows.set(hash(key), {
    id: "k1", userId: "u1", scopes: ["read"], revokedAt: null, expiresAt: null,
    user: { suspendedAt: null, deactivatedAt: null },
  });
});

describe("getApiKeyAuth", () => {
  it("resolves a live key for an active owner", async () => {
    expect(await getApiKeyAuth(req(key))).toEqual({ userId: "u1", apiKeyId: "k1", scopes: ["read"] });
  });

  it("returns null when the key's owner is suspended", async () => {
    rows.get(hash(key))!.user!.suspendedAt = new Date();
    expect(await getApiKeyAuth(req(key))).toBeNull();
  });

  it("returns null when the key's owner is deactivated", async () => {
    rows.get(hash(key))!.user!.deactivatedAt = new Date();
    expect(await getApiKeyAuth(req(key))).toBeNull();
  });

  it("still refuses revoked and expired keys", async () => {
    rows.get(hash(key))!.revokedAt = new Date();
    expect(await getApiKeyAuth(req(key))).toBeNull();
    rows.get(hash(key))!.revokedAt = null;
    rows.get(hash(key))!.expiresAt = new Date(Date.now() - 1000);
    expect(await getApiKeyAuth(req(key))).toBeNull();
  });
});

describe("revokeAllApiKeys", () => {
  it("revokes only the live keys of the given user(s)", async () => {
    expect(await revokeAllApiKeys("u1")).toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: { in: ["u1"] }, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    await revokeAllApiKeys(["u1", "u2"]);
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { userId: { in: ["u1", "u2"] }, revokedAt: null } }));
  });

  it("is a no-op for an empty list", async () => {
    expect(await revokeAllApiKeys([])).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
