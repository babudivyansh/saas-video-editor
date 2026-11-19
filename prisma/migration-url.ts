// The URL the Prisma CLI (migrate deploy, migrate dev, db seed) connects with.
//
// The app itself never reads this: lib/prisma.ts builds its pg.Pool from
// DATABASE_URL directly. Only the CLI uses prisma.config.ts's datasource.url.
//
// Production's DATABASE_URL is Supabase's pooler in TRANSACTION mode (port
// 6543, switched 2026-11-19 to stop EMAXCONNSESSION). `prisma migrate deploy`
// takes a session-level advisory lock and uses prepared statements, which a
// transaction pooler cannot keep across statements, so the build's first step
// failed. Migrations must go through SESSION mode (port 5432, same host).
//
// prisma.config.ts used to compute this and pass it as `directUrl`, but
// Prisma 7's config has no directUrl (only url and shadowDatabaseUrl) and
// ignores unknown keys, so it was never used. It has to be `url`.

export function migrationUrl(env: Record<string, string | undefined>): string {
  const explicit = env.DIRECT_URL || env.DIRECT_DATABASE_URL;
  if (explicit) return explicit;
  const url = env.DATABASE_URL || "";
  if (!/:6543(?=[/?]|$)/.test(url)) return url;
  return url
    .replace(/:6543(?=[/?]|$)/, ":5432")
    .replace(/([?&])pgbouncer=true(&|$)/i, (_m, sep: string, end: string) => (end ? sep : ""))
    .replace(/[?&]$/, "");
}
