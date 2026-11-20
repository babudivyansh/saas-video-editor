import { describe, expect, it } from "vitest";
import {
  DB_POOL_IDLE_MS, DEFAULT_DB_POOL_MAX, TRANSACTION_POOL_IDLE_MS, TRANSACTION_POOL_MAX,
  dbPoolMax, dbPoolOptions, isTransactionPooler,
} from "./db-pool-config";

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
  // CLIPIRO-WEB-9/-1Z/-1Y: transaction mode keeps connections warm.
  it("keeps a larger, warm pool against the transaction pooler (:6543)", () => {
    const url = "postgresql://u:p@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true";
    expect(isTransactionPooler(url)).toBe(true);
    const o = dbPoolOptions({ DATABASE_URL: url });
    expect(o.max).toBe(TRANSACTION_POOL_MAX);
    expect(o.idleTimeoutMillis).toBe(TRANSACTION_POOL_IDLE_MS);
    expect(o.keepAlive).toBe(true);
    expect(dbPoolOptions({ DATABASE_URL: url, DATABASE_POOL_MAX: "20" }).max).toBe(20);
  });
  it("keeps the small, quick-release pool for session mode and local Postgres", () => {
    for (const url of [
      "postgresql://u:p@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres",
      "postgresql://saas:saas@localhost:5432/saas_video",
    ]) {
      expect(isTransactionPooler(url)).toBe(false);
      const o = dbPoolOptions({ DATABASE_URL: url });
      expect(o.max).toBe(DEFAULT_DB_POOL_MAX);
      expect(o.idleTimeoutMillis).toBe(DB_POOL_IDLE_MS);
    }
  });
});
