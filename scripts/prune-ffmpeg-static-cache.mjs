/**
 * Empties ffmpeg-static's download cache after `npm install`.
 *
 * Hostinger, 2026-11-19: `~/.cache/ffmpeg-static-nodejs` held 14.6 GB of the
 * plan's 50 GB. ffmpeg-static's install script downloads its binary through
 * an HTTP file cache keyed by the download URL. GitHub redirects each release
 * download to a freshly signed URL, so the key is new on every install: the
 * cache is never hit, and every deploy's `npm ci` adds another full copy that
 * nothing ever deletes.
 *
 * Production does not even run that binary — it uses the pinned build from
 * scripts/install-render-ffmpeg.mjs — and a cache that never hits costs
 * nothing to lose. Best-effort: never fails the install.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);

export function ffmpegStaticCacheDir() {
  try {
    // The exact path ffmpeg-static uses: envPaths("ffmpeg-static").cache.
    const envPaths = require("env-paths");
    return envPaths("ffmpeg-static").cache;
  } catch {
    const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
    return path.join(base, "ffmpeg-static-nodejs");
  }
}

export function pruneFfmpegStaticCache(dir = ffmpegStaticCacheDir()) {
  let freed = 0;
  let removed = 0;
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return { removed, freed };
  }
  for (const name of names) {
    const p = path.join(dir, name);
    try {
      const st = fs.lstatSync(p);
      if (!st.isFile()) continue;
      fs.unlinkSync(p);
      removed++;
      freed += st.size;
    } catch { /* best-effort */ }
  }
  return { removed, freed };
}

const isMain = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const dir = ffmpegStaticCacheDir();
    const { removed, freed } = pruneFfmpegStaticCache(dir);
    if (removed > 0) console.log(`[ffmpeg-static-cache] removed ${removed} cached download file(s), ${(freed / 1024 / 1024).toFixed(0)} MB, from ${dir}`);
  } catch (e) {
    console.warn(`[ffmpeg-static-cache] skipped: ${e?.message ?? e}`);
  }
}
