// @vitest-environment node
//
// Every /api/mobile/v1 handler must check who's calling (mobile Phase 14,
// security). Only the sign-in steps under auth/ run without a session, as
// they must. A new route that forgets withMobileAuth / withMobileSubscriber
// fails here instead of shipping open. Ownership (each query scoped to the
// caller) is each route's own test; docs/mobile/QA.md lists them.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.join(__dirname);
const PUBLIC_DIR = path.join(ROOT, "auth");

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return routeFiles(p);
    return e.name === "route.ts" ? [p] : [];
  });
}

/** Each exported HTTP handler and the source that defines it. */
function handlers(src: string): { method: string; body: string }[] {
  const re = /^export (?:const|async function) (GET|POST|PUT|PATCH|DELETE)\b/gm;
  const starts = [...src.matchAll(re)];
  return starts.map((m, i) => ({ method: m[1]!, body: src.slice(m.index, starts[i + 1]?.index ?? src.length) }));
}

describe("mobile API auth coverage", () => {
  const files = routeFiles(ROOT);

  it("finds the routes", () => {
    expect(files.length).toBeGreaterThan(60);
  });

  it("checks the caller on every handler outside the sign-in steps", () => {
    const open = files
      .filter((f) => !f.startsWith(PUBLIC_DIR))
      .flatMap((f) => handlers(fs.readFileSync(f, "utf8")).filter((h) => !/withMobile(Auth|Subscriber)\(/.test(h.body)).map((h) => `${h.method} ${path.relative(ROOT, f)}`));
    expect(open).toEqual([]);
  });
});
