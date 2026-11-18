// Deletes this app's own temp files that a dead job left behind.
//
// Hostinger, 2026-11-19: /tmp (.cagefs/tmp) held 24.2 GB of the plan's 50 GB.
// About 30 code paths write downloads and renders to os.tmpdir() and delete
// them in a `finally` — which never runs when the process dies first: a deploy
// restart, the 3 GB memory cap killing the server mid-render, a link import
// cut off mid-download. Nothing ever swept what they left, so it piled up
// release after release (one leftover was a single 2 GB yt-dlp `.part` file).
//
// Runs at boot (instrumentation-node.ts) and every 15 minutes with the
// stale-clip sweep. Only names this app creates are touched: the same hosting
// account serves other sites (PHP sessions live in /tmp too), and locally
// os.tmpdir() is shared with everything else on the machine.

import fs from "fs";
import os from "os";
import path from "path";
import { logger } from "@/lib/logger";

/**
 * Older than this is abandoned. The longest legitimate job is a link import
 * (lib/url-import-jobs.ts gives up on one after an hour); renders are killed
 * by their own 15-minute watchdog.
 */
export const TMP_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[-_.]/i;
// Prisma cuid() ids (clips, dubs): "c" + 24 lowercase alphanumerics.
const CUID = /^c[a-z0-9]{24}[-_.]/;
// Fixed prefixes, each followed by an id. Keep in step with new temp paths.
const PREFIXES = [
  "import", "autoclip", "dub-clean", "thumb-src", "thumb-out", "stock", "scenes",
  "ytdlp-cookies", "face-timeline", "assetzip", "account-export", "shaping",
  "preview", "editor", "caption", "captions", "render-diag", "render-diagnostics-reproduce",
  "diag-write-probe", "fx-smoke", "ytdl", "igdl",
];
const PREFIX = new RegExp(`^(${PREFIXES.map((p) => p.replace(/-/g, "\\-")).join("|")})[-_]`);

/** True for a temp entry this app creates. */
export function isAppTempName(name: string): boolean {
  return UUID.test(name) || CUID.test(name) || PREFIX.test(name);
}

/** Newest mtime of a file, or of a directory and its direct children. */
function lastTouched(p: string, st: fs.Stats): number {
  let newest = st.mtimeMs;
  if (st.isDirectory()) {
    try {
      for (const child of fs.readdirSync(p)) {
        try {
          newest = Math.max(newest, fs.statSync(path.join(p, child)).mtimeMs);
        } catch { /* vanished meanwhile */ }
      }
    } catch { /* unreadable: judge by the directory itself */ }
  }
  return newest;
}

export interface TmpSweepResult {
  removed: number;
  freedBytes: number;
  failed: number;
}

function sizeOf(p: string, st: fs.Stats): number {
  if (!st.isDirectory()) return st.size;
  let total = 0;
  try {
    for (const child of fs.readdirSync(p)) {
      try {
        const cp = path.join(p, child);
        total += sizeOf(cp, fs.statSync(cp));
      } catch { /* vanished meanwhile */ }
    }
  } catch { /* unreadable */ }
  return total;
}

export function sweepAppTempFiles(opts: { dir?: string; maxAgeMs?: number; now?: number } = {}): TmpSweepResult {
  const dir = opts.dir ?? os.tmpdir();
  const cutoff = (opts.now ?? Date.now()) - (opts.maxAgeMs ?? TMP_MAX_AGE_MS);
  const result: TmpSweepResult = { removed: 0, freedBytes: 0, failed: 0 };

  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    logger.warn("tmp-sweep", `cannot read ${dir}`, err);
    return result;
  }

  for (const name of names) {
    if (!isAppTempName(name)) continue;
    const p = path.join(dir, name);
    try {
      const st = fs.lstatSync(p);
      if (st.isSymbolicLink()) continue;
      if (lastTouched(p, st) >= cutoff) continue;
      const bytes = sizeOf(p, st);
      fs.rmSync(p, { recursive: true, force: true });
      result.removed++;
      result.freedBytes += bytes;
    } catch {
      result.failed++;
    }
  }

  if (result.removed > 0 || result.failed > 0) {
    logger.info("tmp-sweep", `removed ${result.removed} stale temp entr${result.removed === 1 ? "y" : "ies"}`, {
      freedMB: Math.round(result.freedBytes / 1024 / 1024),
      failed: result.failed,
    });
  }
  return result;
}
