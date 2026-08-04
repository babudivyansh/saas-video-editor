import { describe, expect, it, vi } from "vitest";

// shared.ts pulls in requireServerSubscriber -> lib/auth -> lib/env at module
// scope. parseFilters itself touches none of it.
vi.mock("@/lib/env", () => ({ env: { JWT_SECRET: "t", NEXT_PUBLIC_APP_URL: "http://localhost:3000" } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), incrWithExpire: vi.fn() },
}));

const { parseFilters } = await import("./shared");

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
