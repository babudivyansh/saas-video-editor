/**
 * Makes Prisma's native schema-engine binary executable after install.
 *
 * WHY THIS EXISTS
 * ---------------
 * 2026-11-18: the Hostinger build of #453 died in its very first step,
 * `prisma migrate deploy`, with
 *   spawn …/node_modules/@prisma/engines/schema-engine-debian-openssl-1.1.x EACCES
 * The binary was there but mode -rw-r--r--. Prisma only chmods +x an engine it
 * DOWNLOADS; when one is already in its cache (~/.cache/prisma/…) it copies
 * it into node_modules, and the copy keeps the cached file's mode. On the
 * Hostinger account the cached schema-engine had lost its x bit (something
 * on the host rewrote it as 0644 — it changed again after the failed build,
 * still 0644), so every build copied a non-executable engine and failed.
 *
 * This runs first in postinstall: it chmods +x every schema-engine in
 * node_modules and in Prisma's cache, so a bad cache can no longer break a
 * deploy. If an engine in node_modules still cannot be executed afterwards
 * (e.g. a noexec mount), install fails here with a message that says so,
 * instead of later inside `prisma migrate deploy`.
 *
 * Windows has no x bit: nothing to do there.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

/** True for a schema-engine executable's file name (not its .sha256/.gz/temp siblings). */
export function isEngineBinaryName(name) {
  if (!/^schema-engine(-[\w.-]+)?$/.test(name)) return false;
  return !/\.(sha256|gz|exe|js|cjs|mjs|ts|map|json)$|\.tmp\d+$/.test(name);
}

/** Prisma's engine cache root, as @prisma/fetch-engine computes it on Linux/macOS. */
export function prismaCacheRoot(env = process.env) {
  return env.XDG_CACHE_HOME ? path.join(env.XDG_CACHE_HOME, "prisma") : path.join(os.homedir(), ".cache", "prisma");
}

/** Engine binaries directly inside `dir`, or anywhere below it when `depth` > 0. */
export function findEngineBinaries(dir, depth = 0) {
  const found = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found; // missing dir: nothing installed there
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth > 0) found.push(...findEngineBinaries(p, depth - 1));
    else if (e.isFile() && isEngineBinaryName(e.name)) found.push(p);
  }
  return found;
}

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * chmods u+x,g+x,o+x on each file that lacks it. Returns what it changed and
 * what is still not executable afterwards.
 */
export function ensureExecutable(files) {
  const fixed = [];
  const stillBroken = [];
  for (const file of files) {
    try {
      const mode = fs.statSync(file).mode;
      const want = mode | 0o111;
      if (mode !== want) {
        fs.chmodSync(file, want & 0o7777);
        fixed.push(file);
      }
    } catch {
      /* reported below if it is still not executable */
    }
    if (!isExecutable(file)) stillBroken.push(file);
  }
  return { fixed, stillBroken };
}

function main() {
  if (process.platform === "win32") return 0;

  const root = process.cwd();
  const installed = [
    ...findEngineBinaries(path.join(root, "node_modules", "@prisma", "engines")),
    ...findEngineBinaries(path.join(root, "node_modules", "prisma")),
  ];
  if (process.env.PRISMA_SCHEMA_ENGINE_BINARY) installed.push(process.env.PRISMA_SCHEMA_ENGINE_BINARY);
  // Cache layout: <root>/<channel>/<engine hash>/<binary target>/schema-engine
  const cached = findEngineBinaries(prismaCacheRoot(), 3);

  const inst = ensureExecutable(installed);
  const cache = ensureExecutable(cached);

  for (const f of [...inst.fixed, ...cache.fixed]) console.log(`[prisma-engine] made executable: ${f}`);
  for (const f of cache.stillBroken) console.warn(`[prisma-engine] cached engine is not executable: ${f}`);
  if (inst.stillBroken.length > 0) {
    for (const f of inst.stillBroken) console.error(`[prisma-engine] cannot execute ${f} even after chmod +x (noexec mount?)`);
    console.error("[prisma-engine] `prisma migrate deploy` would fail with EACCES; failing install now.");
    return 1;
  }
  if (installed.length === 0) console.log("[prisma-engine] no schema-engine binary found in node_modules (nothing to fix)");
  return 0;
}

const executedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) process.exit(main());
