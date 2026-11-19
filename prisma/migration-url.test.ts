// @vitest-environment node
import { describe, expect, it } from "vitest";
import { migrationUrl } from "./migration-url";

const POOLER = "postgresql://postgres.ref:p%40ss@aws-0-ap-northeast-1.pooler.supabase.com";

describe("migrationUrl", () => {
  it("sends a transaction-pooler URL's migrations to session mode", () => {
    expect(migrationUrl({ DATABASE_URL: `${POOLER}:6543/postgres` })).toBe(`${POOLER}:5432/postgres`);
  });

  it("drops pgbouncer=true and keeps the other query params", () => {
    expect(migrationUrl({ DATABASE_URL: `${POOLER}:6543/postgres?pgbouncer=true` })).toBe(`${POOLER}:5432/postgres`);
    expect(migrationUrl({ DATABASE_URL: `${POOLER}:6543/postgres?pgbouncer=true&sslmode=require` })).toBe(`${POOLER}:5432/postgres?sslmode=require`);
    expect(migrationUrl({ DATABASE_URL: `${POOLER}:6543/postgres?sslmode=require&pgbouncer=true` })).toBe(`${POOLER}:5432/postgres?sslmode=require`);
  });

  it("leaves a session-mode or local URL alone", () => {
    expect(migrationUrl({ DATABASE_URL: `${POOLER}:5432/postgres` })).toBe(`${POOLER}:5432/postgres`);
    expect(migrationUrl({ DATABASE_URL: "postgresql://saas:saas@localhost:5432/saas_video" })).toBe("postgresql://saas:saas@localhost:5432/saas_video");
  });

  it("doesn't touch 6543 inside the password", () => {
    const url = "postgresql://u:ab:6543x@localhost:5432/db";
    expect(migrationUrl({ DATABASE_URL: url })).toBe(url);
  });

  it("prefers an explicit DIRECT_URL", () => {
    expect(migrationUrl({ DATABASE_URL: `${POOLER}:6543/postgres`, DIRECT_URL: "postgresql://direct/db" })).toBe("postgresql://direct/db");
  });
});
