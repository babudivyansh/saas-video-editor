import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// ── Mocks ────────────────────────────────────────────────────────────────────
let authUser: { userId: string; email: string; sessionId: string } | null = null;
let subscriber: { userId: string; email: string; sessionId: string } | null = null;

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => authUser),
  requireSubscriber: vi.fn(async () => subscriber),
}));

let accountRows: Array<{ id: string; userId: string; provider: string }> = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    socialAccount: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) => {
        return accountRows.find((a) => a.id === where.id && a.userId === where.userId) ?? null;
      }),
      findMany: vi.fn(
        async ({ where }: { where: { id: { in: string[] }; userId: string } }) =>
          accountRows.filter((a) => where.id.in.includes(a.id) && a.userId === where.userId),
      ),
    },
  },
}));

let rateLimitAllowed = true;
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: rateLimitAllowed, remaining: 0 })),
}));

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException: (...a: unknown[]) => captureException(...a) }));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const {
  assertOwnedAccount,
  assertOwnedAccounts,
  withSocial,
  parseQuery,
  parseBody,
  ok,
  HttpError,
  NotFoundError,
} = await import("./api");
const { ProviderApiError } = await import("./errors");

const ALICE = { userId: "user_alice", email: "a@example.com", sessionId: "s1" };
const BOB = { userId: "user_bob", email: "b@example.com", sessionId: "s2" };

const req = (url = "http://localhost/api/social/test", init?: RequestInit) =>
  new NextRequest(url, init);

beforeEach(() => {
  authUser = ALICE;
  subscriber = ALICE;
  rateLimitAllowed = true;
  captureException.mockClear();
  accountRows = [
    { id: "acc_alice", userId: ALICE.userId, provider: "youtube" },
    { id: "acc_bob", userId: BOB.userId, provider: "instagram" },
  ];
});

// ── Auth gating ──────────────────────────────────────────────────────────────
describe("withSocial auth", () => {
  it("402s a non-subscriber with the code the client checks for", async () => {
    subscriber = null;
    const handler = withSocial(async () => ok({ fine: true }));
    const res = await handler(req());
    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toMatchObject({ code: "subscription_required" });
  });

  it("401s an unauthenticated caller on an ungated route", async () => {
    authUser = null;
    const handler = withSocial(async () => ok({ fine: true }), { subscriber: false });
    const res = await handler(req());
    expect(res.status).toBe(401);
  });

  it("lets a lapsed subscriber through an ungated route so they can delete their data", async () => {
    subscriber = null; // subscription expired
    authUser = ALICE; // but still signed in
    const handler = withSocial(async () => ok({ deleted: true }), { subscriber: false });
    const res = await handler(req());
    expect(res.status).toBe(200);
  });

  it("passes the authenticated user to the handler", async () => {
    const handler = withSocial(async (_r, { auth }) => ok({ userId: auth.userId }));
    await expect((await handler(req())).json()).resolves.toEqual({ data: { userId: ALICE.userId } });
  });
});

// ── Params ───────────────────────────────────────────────────────────────────
describe("withSocial params", () => {
  it("awaits the params promise (Next 16 has no sync shim)", async () => {
    const handler = withSocial<{ id: string }>(async (_r, { params }) => ok({ id: params.id }));
    const res = await handler(req(), { params: Promise.resolve({ id: "abc" }) });
    await expect(res.json()).resolves.toEqual({ data: { id: "abc" } });
  });

  it("defaults to an empty object when a route has no params", async () => {
    const handler = withSocial(async (_r, { params }) => ok({ keys: Object.keys(params) }));
    await expect((await handler(req())).json()).resolves.toEqual({ data: { keys: [] } });
  });

  it("400s rather than 500s when params reject", async () => {
    const handler = withSocial(async () => ok({}));
    const res = await handler(req(), { params: Promise.reject(new Error("bad route")) });
    expect(res.status).toBe(400);
  });
});

// ── Rate limiting ────────────────────────────────────────────────────────────
describe("withSocial rate limiting", () => {
  it("429s with Retry-After when over the limit", async () => {
    rateLimitAllowed = false;
    const handler = withSocial(async () => ok({}), {
      rateLimit: { key: (a) => `test:${a.userId}`, max: 5, windowSec: 60 },
    });
    const res = await handler(req());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("does not rate limit when unconfigured", async () => {
    rateLimitAllowed = false; // would block if consulted
    const handler = withSocial(async () => ok({}));
    expect((await handler(req())).status).toBe(200);
  });
});

// ── Error mapping ────────────────────────────────────────────────────────────
describe("withSocial error mapping", () => {
  const run = async (thrown: unknown) => {
    const handler = withSocial(async () => {
      throw thrown;
    });
    return handler(req());
  };

  it("maps ZodError to 400 with machine-readable issues", async () => {
    const err = (() => {
      try {
        z.object({ range: z.number() }).parse({ range: "nope" });
      } catch (e) {
        return e;
      }
    })();
    const res = await run(err);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.issues[0]).toHaveProperty("path", "range");
  });

  it("maps SyntaxError (malformed JSON body) to 400", async () => {
    expect((await run(new SyntaxError("Unexpected token"))).status).toBe(400);
  });

  it("maps NotFoundError to 404", async () => {
    expect((await run(new NotFoundError("Account not found"))).status).toBe(404);
  });

  it("honours an explicit HttpError", async () => {
    const res = await run(new HttpError(409, "Already tracked", "duplicate"));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: "duplicate" });
  });

  it("maps a provider failure to 502, not 500", async () => {
    const res = await run(new ProviderApiError("youtube", 503, "upstream down"));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ code: "provider_error" });
  });

  it("does not leak the provider's response body to the client", async () => {
    const res = await run(new ProviderApiError("meta", 400, "access_token=SECRET123 invalid"));
    expect(JSON.stringify(await res.json())).not.toContain("SECRET123");
  });

  it("maps an unknown error to 500 and reports it to Sentry", async () => {
    const res = await run(new Error("kaboom"));
    expect(res.status).toBe(500);
    expect(captureException).toHaveBeenCalledOnce();
    // The message must not reach the client.
    await expect(res.json()).resolves.toEqual({ error: "Internal server error" });
  });

  it("does not report handled 4xx errors to Sentry", async () => {
    await run(new NotFoundError());
    expect(captureException).not.toHaveBeenCalled();
  });
});

// ── Tenancy: the security boundary ───────────────────────────────────────────
describe("assertOwnedAccount", () => {
  it("returns the account when the caller owns it", async () => {
    await expect(assertOwnedAccount(ALICE.userId, "acc_alice")).resolves.toMatchObject({
      id: "acc_alice",
    });
  });

  it("throws NotFoundError for another tenant's account", async () => {
    await expect(assertOwnedAccount(ALICE.userId, "acc_bob")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError for an id that does not exist", async () => {
    await expect(assertOwnedAccount(ALICE.userId, "acc_ghost")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("reports a cross-tenant id and a missing id identically — no enumeration oracle", async () => {
    const cross = await assertOwnedAccount(ALICE.userId, "acc_bob").catch((e: Error) => e.message);
    const missing = await assertOwnedAccount(ALICE.userId, "acc_ghost").catch((e: Error) => e.message);
    expect(cross).toBe(missing);
  });

  it("surfaces as a 404 through the wrapper", async () => {
    const handler = withSocial(async (_r, { auth }) => {
      await assertOwnedAccount(auth.userId, "acc_bob");
      return ok({ leaked: true });
    });
    const res = await handler(req());
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain("leaked");
  });
});

describe("assertOwnedAccounts", () => {
  it("accepts a set the caller fully owns", async () => {
    accountRows.push({ id: "acc_alice2", userId: ALICE.userId, provider: "facebook" });
    await expect(assertOwnedAccounts(ALICE.userId, ["acc_alice", "acc_alice2"])).resolves.toHaveLength(2);
  });

  it("rejects the whole batch if even one id belongs to someone else", async () => {
    await expect(
      assertOwnedAccounts(ALICE.userId, ["acc_alice", "acc_bob"]),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects when an id does not exist", async () => {
    await expect(
      assertOwnedAccounts(ALICE.userId, ["acc_alice", "acc_ghost"]),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ── Parsing helpers ──────────────────────────────────────────────────────────
describe("parseQuery / parseBody / ok", () => {
  it("parses query params through a schema", () => {
    const r = req("http://localhost/api/social/test?range=30&tz=UTC");
    const out = parseQuery(r, z.object({ range: z.coerce.number(), tz: z.string() }));
    expect(out).toEqual({ range: 30, tz: "UTC" });
  });

  it("throws ZodError on a bad query, which the wrapper turns into a 400", () => {
    const r = req("http://localhost/api/social/test?range=abc");
    expect(() => parseQuery(r, z.object({ range: z.coerce.number() }))).toThrow();
  });

  it("parses a JSON body", async () => {
    const r = req("http://localhost/api/social/test", {
      method: "POST",
      body: JSON.stringify({ handle: "creator" }),
      headers: { "content-type": "application/json" },
    });
    await expect(parseBody(r, z.object({ handle: z.string() }))).resolves.toEqual({ handle: "creator" });
  });

  it("wraps success in a data envelope", async () => {
    const res = ok({ count: 1 });
    expect(res).toBeInstanceOf(NextResponse);
    await expect(res.json()).resolves.toEqual({ data: { count: 1 } });
  });

  it("passes through a custom status", async () => {
    expect(ok({ id: "x" }, { status: 201 }).status).toBe(201);
  });
});
