import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { createHash } from "crypto";
import { NextRequest } from "next/server";

process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";

interface FakeSessionRecord {
  sessionId: string;
  tokenHash: string;
  device: string;
  ip: string | null;
  country: string | null;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

let users: Map<string, { role: string }>;
// Mirrors lib/auth.ts's real storage shape: one JSON-array-of-sessions key per user.
let sessions: Map<string, FakeSessionRecord[]>;

function resetDb() {
  users = new Map([
    ["admin-1", { role: "ADMIN" }],
    ["user-1", { role: "USER" }],
  ]);
  sessions = new Map([
    ["admin-1", []],
    ["user-1", []],
  ]);
}

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (key: string) => {
      const userId = key.replace("sessions:", "");
      const records = sessions.get(userId);
      return records && records.length > 0 ? JSON.stringify(records) : null;
    }),
    set: vi.fn(async (key: string, value: string) => {
      const userId = key.replace("sessions:", "");
      sessions.set(userId, JSON.parse(value));
    }),
    del: vi.fn(async (key: string) => {
      const userId = key.replace("sessions:", "");
      sessions.set(userId, []);
    }),
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

const { requireAdmin, getAuthUser, completeLogin, listSessions, invalidateOneSession, invalidateAllSessions, signToken } =
  await import("@/lib/auth");

function tokenFor(userId: string): string {
  const sessionId = `session-${userId}`;
  const token = jwt.sign({ userId, email: `${userId}@test.com`, sessionId }, process.env.JWT_SECRET!, { expiresIn: "7d" });
  const now = Date.now();
  sessions.set(userId, [{
    sessionId,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    device: "test",
    ip: null,
    country: null,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: now + 7 * 24 * 60 * 60 * 1000,
  }]);
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

// Multi-session support (lib/auth.ts) — the highest-blast-radius piece of
// the account/security work: a bug here can log every user out or leave a
// stale session valid, so it gets its own direct coverage beyond what
// requireAdmin's tests exercise incidentally.
describe("multi-session support", () => {
  beforeEach(resetDb);
  afterEach(() => vi.clearAllMocks());

  function reqWithUA(token: string, ua = "test-agent"): NextRequest {
    return new NextRequest("http://localhost/api/whoami", {
      headers: { authorization: `Bearer ${token}`, "user-agent": ua },
    });
  }

  it("completeLogin issues a session that getAuthUser accepts", async () => {
    const { token } = await completeLogin(reqWithUA(""), { id: "user-1", email: "user-1@test.com" });
    const result = await getAuthUser(reqWithUA(token));
    expect(result).toMatchObject({ userId: "user-1", email: "user-1@test.com" });
    expect(result?.sessionId).toBeTruthy();
  });

  it("logging in twice (two devices) keeps BOTH sessions valid — the old single-session behavior silently killed the first", async () => {
    const first = await completeLogin(reqWithUA("", "device-a"), { id: "user-1", email: "user-1@test.com" });
    const second = await completeLogin(reqWithUA("", "device-b"), { id: "user-1", email: "user-1@test.com" });

    expect(await getAuthUser(reqWithUA(first.token))).not.toBeNull();
    expect(await getAuthUser(reqWithUA(second.token))).not.toBeNull();

    const sessions = await listSessions("user-1");
    expect(sessions).toHaveLength(2);
  });

  it("getAuthUser rejects a pre-migration token with no sessionId claim, instead of trusting it", async () => {
    const legacyToken = signToken({ userId: "user-1", email: "user-1@test.com" } as never); // simulates an old-shape token
    const result = await getAuthUser(reqWithUA(legacyToken));
    expect(result).toBeNull();
  });

  it("invalidateOneSession only kills that session, not the user's other devices", async () => {
    const a = await completeLogin(reqWithUA("", "device-a"), { id: "user-1", email: "user-1@test.com" });
    const b = await completeLogin(reqWithUA("", "device-b"), { id: "user-1", email: "user-1@test.com" });

    await invalidateOneSession("user-1", a.sessionId);

    expect(await getAuthUser(reqWithUA(a.token))).toBeNull();
    expect(await getAuthUser(reqWithUA(b.token))).not.toBeNull();
  });

  it("invalidateAllSessions(userId, exceptSessionId) kills every session except the one given — the change-password behavior", async () => {
    const current = await completeLogin(reqWithUA("", "current-device"), { id: "user-1", email: "user-1@test.com" });
    const other = await completeLogin(reqWithUA("", "other-device"), { id: "user-1", email: "user-1@test.com" });

    await invalidateAllSessions("user-1", current.sessionId);

    expect(await getAuthUser(reqWithUA(current.token))).not.toBeNull();
    expect(await getAuthUser(reqWithUA(other.token))).toBeNull();
  });

  it("invalidateAllSessions(userId) with no exception kills everything — the admin panic-button behavior", async () => {
    const a = await completeLogin(reqWithUA("", "device-a"), { id: "user-1", email: "user-1@test.com" });
    const b = await completeLogin(reqWithUA("", "device-b"), { id: "user-1", email: "user-1@test.com" });

    await invalidateAllSessions("user-1");

    expect(await getAuthUser(reqWithUA(a.token))).toBeNull();
    expect(await getAuthUser(reqWithUA(b.token))).toBeNull();
    expect(await listSessions("user-1")).toHaveLength(0);
  });

  it("listSessions never exposes the stored token hash, and captures a real device label from the User-Agent", async () => {
    await completeLogin(reqWithUA("", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36"), { id: "user-1", email: "user-1@test.com" });
    const sessions = await listSessions("user-1");
    expect(sessions[0]).not.toHaveProperty("tokenHash");
    expect(sessions[0]).toMatchObject({ device: "Chrome on Windows" });
  });
});
