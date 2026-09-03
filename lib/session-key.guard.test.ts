// Guards the one invariant that broke: the Redis session key is private to
// lib/auth.ts, and every other caller goes through its exported helpers.
//
// Sessions moved from a single `session:${userId}` string to a multi-session
// list under `sessions:${userId}`. Two admin routes kept the old singular key,
// hand-built inline — so `redis.del("session:" + id)` on delete-user matched
// nothing and left every one of that user's JWTs valid until natural expiry
// (up to seven days), while the admin user-detail panel reported "no active
// session" for absolutely everyone.
//
// Neither failure was visible: both look exactly like success. A type can't
// catch a wrong string, so this does — it fails if anyone reconstructs a
// session key outside lib/auth.ts instead of calling invalidateAllSessions,
// invalidateOneSession or listSessions.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, sep } from "path";

const ROOT = join(__dirname, "..");
const SEARCH_DIRS = ["app", "lib", "utils"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", "coverage"]);

/** The owner of the key format — the only file allowed to build one. */
const OWNER = join("lib", "auth.ts");

/** `session:` or `sessions:` inside a template literal or string concatenation. */
const SESSION_KEY = /["'`]sessions?:\s*(\$\{|"|'|\s*\+)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

describe("Redis session key ownership", () => {
  it("is constructed only inside lib/auth.ts", () => {
    const offenders: string[] = [];

    for (const dir of SEARCH_DIRS) {
      const abs = join(ROOT, dir);
      try {
        statSync(abs);
      } catch {
        continue;
      }
      for (const file of walk(abs)) {
        const rel = relative(ROOT, file);
        if (rel === OWNER || rel === OWNER.split(sep).join("/")) continue;

        const source = readFileSync(file, "utf8");
        for (const [i, line] of source.split(/\r?\n/).entries()) {
          // Ignore comments — this file and several others discuss the key.
          const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
          if (SESSION_KEY.test(code)) offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
        }
      }
    }

    expect(
      offenders,
      "Build session keys through lib/auth.ts's exported helpers " +
        "(invalidateAllSessions / invalidateOneSession / listSessions) rather than " +
        "inline — a singular `session:` key silently matches nothing:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("still exports the helpers those callers are meant to use", async () => {
    // Cheap contract check: if one of these is ever removed or renamed, the
    // guard above would push callers straight back to inline keys.
    const source = readFileSync(join(ROOT, OWNER), "utf8");
    for (const fn of ["invalidateAllSessions", "invalidateOneSession", "listSessions"]) {
      expect(source).toContain(`export async function ${fn}`);
    }
    // And the key builder itself stays private.
    expect(source).not.toContain("export function sessionsKey");
  });
});
