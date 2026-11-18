import { describe, expect, it } from "vitest";
import { DEFAULT_DB_POOL_MAX, dbPoolMax, dbPoolOptions } from "./db-pool-config";

// CLIPIRO-WEB-9/-16: the pool must stay under Supabase's 15-client session
// pooler even with two processes alive during a deploy.
describe("db pool sizing", () => {
  it("defaults to a cap two processes can share under 15", () => {
    expect(DEFAULT_DB_POOL_MAX * 2).toBeLessThanOrEqual(15);
    expect(dbPoolMax(undefined)).toBe(DEFAULT_DB_POOL_MAX);
  });
  it("takes DATABASE_POOL_MAX when it is a sane number", () => {
    expect(dbPoolMax("12")).toBe(12);
    expect(dbPoolMax("0")).toBe(DEFAULT_DB_POOL_MAX);
    expect(dbPoolMax("lots")).toBe(DEFAULT_DB_POOL_MAX);
  });
  it("sets an acquire timeout so a starved pool fails instead of hanging", () => {
    const o = dbPoolOptions({ DATABASE_URL: "postgres://x" });
    expect(o.connectionTimeoutMillis).toBeGreaterThan(0);
    expect(o.connectionString).toBe("postgres://x");
  });
});
