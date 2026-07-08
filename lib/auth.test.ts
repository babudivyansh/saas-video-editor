import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";

let users: Map<string, { role: string }>;
let sessions: Map<string, string>;

function resetDb() {
  users = new Map([
    ["admin-1", { role: "ADMIN" }],
    ["user-1", { role: "USER" }],
  ]);
  sessions = new Map([
    ["admin-1", ""],
    ["user-1", ""],
  ]);
}

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (key: string) => {
      const userId = key.replace("session:", "");
      return sessions.get(userId) ?? null;
    }),
    set: vi.fn(async () => {}),
    del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null),
    },
  },
}));

const { requireAdmin } = await import("@/lib/auth");

function tokenFor(userId: string): string {
  const token = jwt.sign({ userId, email: `${userId}@test.com` }, process.env.JWT_SECRET!, { expiresIn: "7d" });
  sessions.set(userId, token);
  return token;
}

function reqWithToken(token: string): NextRequest {
  return new NextRequest("http://localhost/api/admin/affiliates", {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("requireAdmin", () => {
  beforeEach(resetDb);
  afterEach(() => vi.clearAllMocks());

  it("returns the token payload for an ADMIN user (so an admin route can proceed)", async () => {
    const token = tokenFor("admin-1");
    const result = await requireAdmin(reqWithToken(token));
    expect(result).toMatchObject({ userId: "admin-1", email: "admin-1@test.com" });
  });

  it("returns null for a non-admin JWT, so the caller should 403", async () => {
    const token = tokenFor("user-1");
    const result = await requireAdmin(reqWithToken(token));
    expect(result).toBeNull();
  });

  it("returns null with no Authorization header at all", async () => {
    const result = await requireAdmin(new NextRequest("http://localhost/api/admin/affiliates"));
    expect(result).toBeNull();
  });
});
