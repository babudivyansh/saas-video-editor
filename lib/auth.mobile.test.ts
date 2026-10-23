import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";

// One JSON array of session records per user, as lib/auth.ts stores them.
let store: Map<string, string>;
let ttls: Map<string, number>;
let users: Map<string, { email: string; suspendedAt: Date | null; deactivatedAt: Date | null }>;

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, _ex: string, ttl: number) => {
      store.set(key, value);
      ttls.set(key, ttl);
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  },
}));
// The strict variants (used by revocation) share the same store.
{
  const { redis } = await import("@/lib/redis");
  const r = redis as unknown as Record<string, (...a: unknown[]) => unknown>;
  r.getStrict = (key) => r.get(key);
  r.setStrict = (key, value, ttl) => r.set(key, value, "EX", ttl);
  r.delStrict = (key) => r.del(key);
}
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null) } },
}));

const { completeLogin, convertToMobileSession, getAuthUser, refreshMobileSession, revokeMobileSession, listSessions, MOBILE_REFRESH_TTL } = await import("@/lib/auth");

const DAY = 24 * 60 * 60;
const req = (token?: string) =>
  new NextRequest("http://localhost/api/x", { headers: { "user-agent": "Clipiro/1.0 (Android 15)", ...(token ? { authorization: `Bearer ${token}` } : {}) } });

async function mobileLogin() {
  const { token } = await completeLogin(req(), { id: "u1", email: "maya@creatorlab.co" });
  const tokens = await convertToMobileSession(token);
  if (!tokens) throw new Error("no session");
  return { webToken: token, tokens };
}

beforeEach(() => {
  store = new Map();
  ttls = new Map();
  users = new Map([["u1", { email: "maya@creatorlab.co", suspendedAt: null, deactivatedAt: null }]]);
});

describe("mobile sessions", () => {
  it("turns a fresh login into a 1-hour access token and a refresh token; the web token stops working", async () => {
    const { webToken, tokens } = await mobileLogin();
    expect(tokens.expiresIn).toBe(3600);
    expect(await getAuthUser(req(tokens.accessToken))).toMatchObject({ userId: "u1" });
    expect(await getAuthUser(req(webToken))).toBeNull();
    // The session (and its Redis key) now lives 60 days.
    expect(ttls.get("sessions:u1")).toBeGreaterThan(59 * DAY);
    expect((await listSessions("u1"))[0]!.expiresAt - Date.now()).toBeGreaterThan((MOBILE_REFRESH_TTL - 60) * 1000);
  });

  it("rotates on refresh: new pair works, the old access and refresh tokens don't", async () => {
    const { tokens } = await mobileLogin();
    const r = await refreshMobileSession(tokens.refreshToken);
    if (!r.ok) throw new Error(r.reason);
    expect(r.tokens.refreshToken).not.toBe(tokens.refreshToken);
    expect(await getAuthUser(req(r.tokens.accessToken))).toMatchObject({ userId: "u1" });
    expect(await getAuthUser(req(tokens.accessToken))).toBeNull();
    const again = await refreshMobileSession(r.tokens.refreshToken);
    expect(again.ok).toBe(true);
  });

  it("ends the whole session when a rotated-away refresh token comes back", async () => {
    const { tokens } = await mobileLogin();
    const r = await refreshMobileSession(tokens.refreshToken);
    if (!r.ok) throw new Error(r.reason);
    expect(await refreshMobileSession(tokens.refreshToken)).toEqual({ ok: false, reason: "reused" });
    // The current pair is gone too: whoever holds it must sign in again.
    expect(await getAuthUser(req(r.tokens.accessToken))).toBeNull();
    expect((await refreshMobileSession(r.tokens.refreshToken)).ok).toBe(false);
  });

  it("refuses made-up, malformed and web-session refresh tokens", async () => {
    const { tokens } = await mobileLogin();
    const [userId, sessionId] = tokens.refreshToken.split(".");
    expect(await refreshMobileSession(`${userId}.${sessionId}.forged`)).toEqual({ ok: false, reason: "invalid" });
    expect(await refreshMobileSession("not-a-token")).toEqual({ ok: false, reason: "invalid" });
    const web = await completeLogin(req(), { id: "u1", email: "maya@creatorlab.co" });
    expect(await refreshMobileSession(`u1.${web.sessionId}.x`)).toEqual({ ok: false, reason: "invalid" });
  });

  it("stops refreshing a suspended account and drops its session", async () => {
    const { tokens } = await mobileLogin();
    users.get("u1")!.suspendedAt = new Date();
    expect((await refreshMobileSession(tokens.refreshToken)).ok).toBe(false);
    expect(await listSessions("u1")).toHaveLength(0);
  });

  it("logs out with the refresh token, leaving other sessions alone", async () => {
    const a = await mobileLogin();
    const b = await mobileLogin();
    expect(await revokeMobileSession(a.tokens.refreshToken)).toMatchObject({ userId: "u1" });
    expect(await getAuthUser(req(a.tokens.accessToken))).toBeNull();
    expect(await getAuthUser(req(b.tokens.accessToken))).toMatchObject({ userId: "u1" });
    expect(await revokeMobileSession(a.tokens.refreshToken)).toBeNull();
  });

  it("keeps a web session's 7-day key TTL when there's no mobile session", async () => {
    await completeLogin(req(), { id: "u1", email: "maya@creatorlab.co" });
    const ttl = ttls.get("sessions:u1")!;
    expect(ttl).toBeGreaterThan(7 * DAY - 5);
    expect(ttl).toBeLessThanOrEqual(7 * DAY);
  });
});
