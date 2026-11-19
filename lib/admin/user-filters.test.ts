import { describe, expect, it } from "vitest";
import { buildUserWhere } from "./user-filters";

const now = new Date("2026-11-19T12:00:00Z");
const where = (qs: string) => buildUserWhere(new URLSearchParams(qs), now);
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("buildUserWhere", () => {
  it("is empty with no filters", () => {
    expect(where("")).toEqual({});
  });

  it("keeps the support filters and search", () => {
    expect(where("search=priya&filter=suspended")).toEqual({
      AND: [
        { OR: [{ email: { contains: "priya", mode: "insensitive" } }, { name: { contains: "priya", mode: "insensitive" } }] },
        { suspendedAt: { not: null } },
      ],
    });
    expect(where("filter=subscribed")).toEqual({ AND: [{ subscriptionEndsAt: { gt: now }, planId: { not: null } }] });
  });

  it("finds signups who got stuck before their first AutoClip run", () => {
    expect(where("journey=stuck")).toEqual({
      AND: [{ role: "USER", purgedAt: null }, { projects: { none: { productType: "auto-clip" } } }, { createdAt: { lt: daysAgo(1) } }],
    });
  });

  it("finds the upgrade audience: ran AutoClip, never paid", () => {
    expect(where("journey=free_after_run")).toEqual({
      AND: [
        { role: "USER", purgedAt: null },
        { projects: { some: { productType: "auto-clip" } } },
        { purchases: { none: { amountInPaise: { gt: 0 } } } },
      ],
    });
  });

  it("combines joined, method, use and activity", () => {
    expect(where("joined=7d&method=google&use=content_creator&active=inactive_30d")).toEqual({
      AND: [
        { createdAt: { gte: daysAgo(7) } },
        { hasPassword: false },
        { intendedUse: "content_creator" },
        { OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: daysAgo(30) } }] },
      ],
    });
  });

  it("ignores unknown or unsafe values", () => {
    expect(where("journey=everyone&joined=5y&method=sso&use=a'b&active=never")).toEqual({});
  });
});
