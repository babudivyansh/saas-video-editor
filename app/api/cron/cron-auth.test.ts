import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

// Every cron route is a PUBLIC, unauthenticated-by-default HTTP endpoint whose
// only protection is a shared secret. They must therefore fail CLOSED: an
// unset secret has to make the endpoint unusable, never unauthenticated.
//
// This exists because clip-publish shipped with `if (secret) { ...check... }`,
// which skips the check entirely when the secret is absent. On a deploy that
// hadn't set CRON_SECRET, that left an endpoint able to publish users' clips
// to their connected social accounts open to anyone who knew the URL. Eleven
// of the twelve routes already had it right; a lint rule can't see this, so a
// test does.

const CRON_DIR = path.join(process.cwd(), "app", "api", "cron");

/** Comments are stripped: a comment DESCRIBING the antipattern (as the fix for
 *  clip-publish does) must not read as the antipattern itself. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function cronRoutes(): { name: string; source: string }[] {
  return fs.readdirSync(CRON_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, file: path.join(CRON_DIR, e.name, "route.ts") }))
    .filter((r) => fs.existsSync(r.file))
    .map((r) => ({ name: r.name, source: stripComments(fs.readFileSync(r.file, "utf8")) }));
}

describe("cron route authentication", () => {
  const routes = cronRoutes();

  it("finds the cron routes to check", () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  it.each(routes.map((r) => r.name))("%s rejects when the secret is unset (fails closed)", (name) => {
    const { source } = routes.find((r) => r.name === name)!;

    // The fail-open shape: the whole auth block guarded by the secret existing.
    const failsOpen = /if\s*\(\s*secret\s*\)\s*\{/.test(source);
    expect(failsOpen, `${name} skips its auth check when the secret is unset`).toBe(false);

    // And the fail-closed shape must actually be present.
    const failsClosed = /if\s*\(\s*!\s*secret\s*\|\|/.test(source);
    expect(failsClosed, `${name} does not reject on a missing secret`).toBe(true);
  });

  it.each(routes.map((r) => r.name))("%s returns 401 rather than silently continuing", (name) => {
    const { source } = routes.find((r) => r.name === name)!;
    expect(source).toContain("401");
  });
});
