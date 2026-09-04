import { beforeEach, describe, expect, it, vi } from "vitest";

// shared.ts pulls in getServerSubscriberState -> lib/auth -> lib/env at module
// scope. parseFilters itself touches none of it.
vi.mock("@/lib/env", () => ({ env: { JWT_SECRET: "t", NEXT_PUBLIC_APP_URL: "http://localhost:3000" } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), incrWithExpire: vi.fn() },
}));

// `redirect()` throws in Next so control never returns to the caller. Modelling
// that (rather than returning) is what lets the tests below assert the gate
// stops, not merely that it called something on its way to returning a value.
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url) }));

const subscriberState = vi.fn();
vi.mock("@/lib/auth", () => ({ getServerSubscriberState: () => subscriberState() }));

const { parseFilters, requireSubscriberOrRedirect } = await import("./shared");

// parseFilters is pure, so the account-first routing contract can be pinned
// without a database or a rendered page. `scope` is what every surface reads to
// decide between the picker, one account, and the comparison view.

describe("parseFilters — account scope", () => {
  it("treats a missing ?account as 'not chosen', not as 'all'", () => {
    // The distinction IS the feature: unset means show the picker. Defaulting
    // it to "all" is exactly the portfolio-first behaviour being replaced.
    expect(parseFilters({}).scope).toEqual({ kind: "unset" });
  });

  it("scopes to one account and narrows the load to it", () => {
    const filters = parseFilters({ account: "acc_1" });
    expect(filters.scope).toEqual({ kind: "one", id: "acc_1" });
    expect(filters.accountIds).toEqual(["acc_1"]);
  });

  it("treats ?account=all as the deliberate comparison view", () => {
    const filters = parseFilters({ account: "all" });
    expect(filters.scope).toEqual({ kind: "all" });
    // No id filter — every account loads.
    expect(filters.accountIds).toBeUndefined();
  });

  it("lets ?account win over the legacy ?accounts list", () => {
    const filters = parseFilters({ account: "acc_1", accounts: "acc_2,acc_3" });
    expect(filters.accountIds).toEqual(["acc_1"]);
  });

  it("still honours the legacy ?accounts list when no account is scoped", () => {
    expect(parseFilters({ accounts: "acc_2,acc_3" }).accountIds).toEqual(["acc_2", "acc_3"]);
  });

  it("takes the first value when Next hands over an array", () => {
    expect(parseFilters({ account: ["acc_1", "acc_2"] }).scope).toEqual({ kind: "one", id: "acc_1" });
  });
});

describe("parseFilters — the rest of the query string", () => {
  it("falls back rather than erroring on a hand-edited range", () => {
    // A bad URL should degrade to the default view, not an error page.
    expect(parseFilters({ range: "999" }).range).toBe(30);
    expect(parseFilters({ range: "not-a-number" }).range).toBe(30);
    expect(parseFilters({ range: "7" }).range).toBe(7);
  });

  it("only accepts the granularities the engine buckets by", () => {
    expect(parseFilters({ granularity: "week" }).granularity).toBe("week");
    expect(parseFilters({ granularity: "hourly" }).granularity).toBe("day");
  });

  it("reads the compare flag as an explicit opt-in", () => {
    expect(parseFilters({ compare: "previous" }).compare).toBe(true);
    expect(parseFilters({ compare: "yes" }).compare).toBe(false);
    expect(parseFilters({}).compare).toBe(false);
  });
});

// The gate routes by WHY access was denied. Collapsing both denials into one
// destination is the bug these pin: a paying subscriber whose session record
// had vanished (revoked elsewhere, or Redis unreachable) was shown the billing
// overlay telling them they had no subscription.
describe("requireSubscriberOrRedirect", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    subscriberState.mockReset();
  });

  it("lets an active subscriber through and redirects nowhere", async () => {
    const auth = { userId: "u1", sessionId: "s1" };
    subscriberState.mockResolvedValue({ status: "active", auth });

    await expect(requireSubscriberOrRedirect()).resolves.toBe(auth);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("sends a lapsed subscriber to the billing OVERLAY, not /dashboard/billing", async () => {
    // /dashboard/billing has no page and no redirect rule — it 404s. The
    // overlay is a query param on the dashboard itself.
    subscriberState.mockResolvedValue({ status: "unsubscribed", auth: { userId: "u1" } });

    await expect(requireSubscriberOrRedirect()).rejects.toThrow("REDIRECT:/dashboard?billing=1");
  });

  it("sends a dead session to log in again, not to the billing overlay", async () => {
    subscriberState.mockResolvedValue({ status: "unauthenticated" });

    await expect(requireSubscriberOrRedirect()).rejects.toThrow(/REDIRECT:/);
    const target = redirectMock.mock.calls[0][0];

    // Via the cookie-clearing hop, never straight to /login: the cookie's JWT
    // is still valid (that is how the request reached the page at all), so
    // proxy.ts would bounce /login back to /dashboard with the same dead
    // session still attached.
    expect(target).toContain("/api/auth/session-expired");
    expect(target).not.toContain("billing");
    // And it comes back here afterwards.
    expect(target).toContain(`next=${encodeURIComponent("/dashboard/social-tracker")}`);
  });

  it("never redirects into the Social Tracker itself", async () => {
    // Either denial landing back under this path would loop: the layout gates
    // every render, so it would deny again and redirect again.
    for (const status of ["unsubscribed", "unauthenticated"] as const) {
      redirectMock.mockClear();
      subscriberState.mockResolvedValue({ status, auth: { userId: "u1" } });
      await expect(requireSubscriberOrRedirect()).rejects.toThrow(/REDIRECT:/);

      const target = redirectMock.mock.calls[0][0] as string;
      // The path itself must be outside the tracker. It may still appear as a
      // ?next= value, which is a destination for *after* signing in.
      expect(target.split("?")[0].startsWith("/dashboard/social-tracker")).toBe(false);
    }
  });
});
