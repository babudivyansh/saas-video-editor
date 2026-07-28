import { describe, expect, it } from "vitest";
import { isPublicApiRoute } from "./api-public-routes";

/**
 * These assertions exist because forgetting to register a public route fails in
 * a uniquely invisible way: the route works perfectly in local development (you
 * are logged in) and in CI (no e2e exercises a logged-out request), and only
 * 401s for the logged-out visitors it was built for.
 */
describe("isPublicApiRoute", () => {
  it("un-gates the anonymous marketing beacon", () => {
    expect(isPublicApiRoute("/api/marketing/event")).toBe(true);
  });

  it("un-gates the whole newsletter double opt-in flow", () => {
    expect(isPublicApiRoute("/api/newsletter/subscribe")).toBe(true);
    expect(isPublicApiRoute("/api/newsletter/confirm")).toBe(true);
    expect(isPublicApiRoute("/api/newsletter/unsubscribe")).toBe(true);
  });

  it("still gates authenticated routes", () => {
    expect(isPublicApiRoute("/api/projects")).toBe(false);
    expect(isPublicApiRoute("/api/billing/subscription")).toBe(false);
    expect(isPublicApiRoute("/api/admin/users")).toBe(false);
  });

  // Guards against a prefix being loosened into something that also matches an
  // unrelated, authenticated namespace.
  it("does not un-gate lookalike paths outside the registered prefixes", () => {
    expect(isPublicApiRoute("/api/marketingsecrets")).toBe(false);
    expect(isPublicApiRoute("/api/newslettersecrets")).toBe(false);
  });
});
