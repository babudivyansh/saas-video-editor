// Connection-pool sizing for the app's one pg.Pool (lib/prisma.ts).
//
// CLIPIRO-WEB-9 / -16: "(EMAXCONNSESSION) max clients reached in session mode
// - max clients are limited to pool_size: 15". Production's DATABASE_URL
// points at Supabase's pooler in SESSION mode, where every open client
// connection pins one of only 15 server connections. pg.Pool defaults to 10
// connections, and the pool was created per module instance: Turbopack gives
// some entries (instrumentation, the proxy bundle) their own copy of
// lib/prisma.ts, and during a deploy the old and the new process overlap. Two
// or three pools of 10 against a 15-connection cap is a guaranteed overflow
// under any burst (a page with eight parallel queries, a wave of web-vitals
// beacons).
//
// So: one pool per process (cached on globalThis in every environment, see
// lib/prisma.ts) and a small default cap that stays under the pooler limit
// even with two processes alive mid-deploy. Requests beyond the cap queue
// inside the pool instead of opening a connection the pooler will refuse.
//
// Switching DATABASE_URL to the pooler's TRANSACTION mode (port 6543) removes
// the 15-client ceiling altogether; prisma.config.ts already routes
// migrations to session mode when it sees :6543.

export const DEFAULT_DB_POOL_MAX = 6;
/** Release idle connections quickly so an outgoing process hands them back. */
export const DB_POOL_IDLE_MS = 10_000;
/** Fail a request that cannot get a connection, rather than hang forever. */
export const DB_POOL_ACQUIRE_TIMEOUT_MS = 20_000;

// Transaction mode (port 6543, production since 2026-11-19). A client
// connection no longer pins a server connection, so the 15-client ceiling and
// the reason for the tiny cap and the 10s idle release are gone. Keeping them
// cost a fresh TCP + TLS + SCRAM handshake, Mumbai -> Tokyo (~120 ms RTT), on
// almost every request after a quiet spell; whenever Supavisor was slow to
// authenticate, those handshakes failed as "(EAUTHTIMEOUT) timeout while
// waiting for message" and the queue behind six slots ran into the 20s acquire
// timeout ("timeout exceeded when trying to connect") — CLIPIRO-WEB-9/-1Z/-1Y.
// So connections are kept warm for minutes and the cap is the pooler's
// default pool size.
export const TRANSACTION_POOL_MAX = 15;
export const TRANSACTION_POOL_IDLE_MS = 5 * 60_000;

/** True for Supabase's transaction-mode pooler (port 6543). */
export function isTransactionPooler(url: string | undefined): boolean {
  return !!url && /:6543(?:[/?]|$)/.test(url);
}

export function dbPoolMax(raw: string | undefined, fallback = DEFAULT_DB_POOL_MAX): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 1 && n <= 100 ? n : fallback;
}

export function dbPoolOptions(env: { DATABASE_URL?: string; DATABASE_POOL_MAX?: string }) {
  const txn = isTransactionPooler(env.DATABASE_URL);
  return {
    connectionString: env.DATABASE_URL,
    max: dbPoolMax(env.DATABASE_POOL_MAX, txn ? TRANSACTION_POOL_MAX : DEFAULT_DB_POOL_MAX),
    idleTimeoutMillis: txn ? TRANSACTION_POOL_IDLE_MS : DB_POOL_IDLE_MS,
    connectionTimeoutMillis: DB_POOL_ACQUIRE_TIMEOUT_MS,
    // A warm connection that sits idle for minutes must survive NAT/LB idle
    // reaping between Hostinger and the pooler.
    keepAlive: true,
  };
}
