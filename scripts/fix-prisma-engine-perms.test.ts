// The guard that keeps a non-executable cached Prisma engine from breaking
// the Hostinger build (EACCES in `prisma migrate deploy`, 2026-11-18).

import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs script, no type declarations by design.
import { isEngineBinaryName, findEngineBinaries, ensureExecutable, prismaCacheRoot } from "./fix-prisma-engine-perms.mjs";

const dirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-engine-guard-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("isEngineBinaryName", () => {
  it("accepts the engine binaries, cached and installed", () => {
    expect(isEngineBinaryName("schema-engine")).toBe(true);
    expect(isEngineBinaryName("schema-engine-debian-openssl-1.1.x")).toBe(true);
    expect(isEngineBinaryName("schema-engine-linux-musl-openssl-3.0.x")).toBe(true);
  });

  it("rejects checksums, archives, temp copies and other files", () => {
    for (const name of [
      "schema-engine.sha256",
      "schema-engine.gz.sha256",
      "schema-engine-debian-openssl-1.1.x.sha256",
      "schema-engine-debian-openssl-1.1.x.tmp4242",
      "schema-engine-windows.exe",
      "index.js",
      "package.json",
      "query-engine",
    ]) {
      expect(isEngineBinaryName(name), name).toBe(false);
    }
  });
});

describe("findEngineBinaries", () => {
  it("finds engines in a dir and, with depth, in the cache layout", () => {
    const root = tmp();
    fs.writeFileSync(path.join(root, "schema-engine-debian-openssl-1.1.x"), "x");
    fs.writeFileSync(path.join(root, "README.md"), "x");
    const deep = path.join(root, "master", "abc123", "debian-openssl-1.1.x");
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(deep, "schema-engine"), "x");
    fs.writeFileSync(path.join(deep, "schema-engine.sha256"), "x");

    expect(findEngineBinaries(root).map((p: string) => path.basename(p))).toEqual(["schema-engine-debian-openssl-1.1.x"]);
    expect(findEngineBinaries(root, 3).map((p: string) => path.relative(root, p)).sort()).toEqual(
      [path.join("master", "abc123", "debian-openssl-1.1.x", "schema-engine"), "schema-engine-debian-openssl-1.1.x"].sort(),
    );
  });

  it("returns nothing for a missing dir", () => {
    expect(findEngineBinaries(path.join(tmp(), "nope"))).toEqual([]);
  });
});

describe("prismaCacheRoot", () => {
  it("follows XDG_CACHE_HOME like @prisma/fetch-engine", () => {
    expect(prismaCacheRoot({ XDG_CACHE_HOME: "/x/cache" })).toBe(path.join("/x/cache", "prisma"));
    expect(prismaCacheRoot({})).toBe(path.join(os.homedir(), ".cache", "prisma"));
  });
});

describe.skipIf(process.platform === "win32")("ensureExecutable (POSIX modes)", () => {
  it("adds the x bits to a 0644 engine — the exact Hostinger failure", () => {
    const f = path.join(tmp(), "schema-engine-debian-openssl-1.1.x");
    fs.writeFileSync(f, "#!/bin/sh\n");
    fs.chmodSync(f, 0o644);

    const { fixed, stillBroken } = ensureExecutable([f]);
    expect(fixed).toEqual([f]);
    expect(stillBroken).toEqual([]);
    expect(fs.statSync(f).mode & 0o777).toBe(0o755);
  });

  it("leaves an already-executable engine alone", () => {
    const f = path.join(tmp(), "schema-engine");
    fs.writeFileSync(f, "x");
    fs.chmodSync(f, 0o755);
    expect(ensureExecutable([f])).toEqual({ fixed: [], stillBroken: [] });
  });

  it("reports a file it cannot make executable", () => {
    const missing = path.join(tmp(), "schema-engine");
    expect(ensureExecutable([missing])).toEqual({ fixed: [], stillBroken: [missing] });
  });
});
