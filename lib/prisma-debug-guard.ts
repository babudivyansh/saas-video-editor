// Neutralises Prisma's internal `debug`-package logging in production.
//
// Prisma's engine and driver adapter emit their verbose `prisma:client`,
// `prisma:client:clientEngine` and `prisma:driver-adapter:pg` output through the
// `debug` npm package, which is enabled purely by the `DEBUG` env var — the
// PrismaClient `log` option does NOT control it. A `DEBUG=prisma:*` (or `DEBUG=*`)
// left set in the Hostinger production environment therefore dumps the full query
// plan + SQL + argTypes for every single query, flooding the logs and paying the
// cost of serialising those objects on the hot path.
//
// `debug` reads `process.env.DEBUG` once, when each namespace is first created at
// module-eval time. This module is imported *before* `@prisma/client` and
// `@prisma/adapter-pg` in lib/prisma.ts, so stripping the prisma namespaces here
// runs before those debuggers exist. Only prisma-enabling entries are removed, and
// only in production, so a deliberate `DEBUG=myapp:*` on the server — or any
// `DEBUG` a developer sets locally — is left untouched.

/**
 * Returns `debug` (a comma-separated DEBUG value) with every Prisma-enabling
 * entry removed, or `undefined` if nothing meaningful remains. An entry enables
 * Prisma logging if it's the catch-all `*` or targets the `prisma` namespace
 * (`prisma`, `prisma:*`, `prisma:client`, …). Negations (`-prisma:*`), unrelated
 * namespaces, and lookalikes that merely start with "prisma" (`prismaish`) are
 * preserved. Pure — the exported entry point the unit tests exercise.
 */
export function stripPrismaDebugNamespaces(debug: string | undefined): string | undefined {
  if (!debug) return undefined;
  const kept = debug
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry && entry !== "*" && !/^prisma(:|$)/.test(entry));
  return kept.length ? kept.join(",") : undefined;
}

if (process.env.NODE_ENV === "production" && process.env.DEBUG) {
  const original = process.env.DEBUG;
  const sanitized = stripPrismaDebugNamespaces(original);

  if (sanitized === undefined) delete process.env.DEBUG;
  else process.env.DEBUG = sanitized;

  if (sanitized !== original) {
    // Deliberately console.* (not lib/logger) to stay dependency-free at boot.
    // eslint-disable-next-line no-console
    console.warn(
      `[prisma] Stripped Prisma debug namespaces from DEBUG in production ` +
        `(was "${original}"). Remove DEBUG from the production environment to silence this.`,
    );
  }
}
