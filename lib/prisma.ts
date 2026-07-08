import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { logger } from "@/lib/logger";
// Automatically rewrite direct Supabase connection strings (IPv6-only) to the IPv4 Connection Pooler.
// Deliberately reads/writes raw `process.env.DATABASE_URL` rather than lib/env.ts's `env.DATABASE_URL`:
// `env` is parsed once, eagerly, at that module's own import time, so if anything imports lib/env.ts
// before this rewrite runs, `env.DATABASE_URL` would freeze on the pre-rewrite value. The `pg.Pool`
// below reads `process.env.DATABASE_URL` again (not `dbUrl`) for the same reason — it must observe
// this rewrite, not a value captured before it.
let dbUrl = process.env.DATABASE_URL;
if (dbUrl && dbUrl.includes("supabase")) {
  // Format 1: postgresql://user:pass@db.<ref>.supabase.co:5432/<db>
  const matchDirect = dbUrl.match(/postgresql:\/\/([^:]+):(.+)@db\.([^.]+)\.supabase\.co:5432\/(.+)/);
  // Format 2: postgresql://user:pass@postgres.<ref>.supabase.co:5432/<db>  (or similar)
  const matchPostgres = !matchDirect && dbUrl.match(/postgresql:\/\/([^:]+):(.+)@postgres\.([^.]+)\.supabase\.co(?::\d+)?\/(.+)/);
  const match = matchDirect || matchPostgres;
  if (match) {
    const [_, user, password, projectRef, dbName] = match;
    dbUrl = `postgresql://${user}.${projectRef}:${password}@aws-0-ap-south-1.pooler.supabase.com:6543/${dbName}?pgbouncer=true&connection_limit=1`;
    process.env.DATABASE_URL = dbUrl;
    logger.info("prisma", "Automatically rewrote direct Supabase URL to IPv4 connection pooler");
  }
}


const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
  pgPool: pg.Pool;
};

const pool =
  globalForPrisma.pgPool ??
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.pgPool = pool;

const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
