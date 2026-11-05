/**
 * Installs the pinned, standalone Linux yt-dlp the downloaders and AutoClip's
 * URL import run in production.
 *
 * WHY THIS EXISTS
 * ---------------
 * youtube-dl-exec's postinstall downloads the release asset named `yt-dlp`.
 * On Linux that is NOT a native program: it is a Python zipapp
 * (`#!/usr/bin/env python3`). clipiro.com's Hostinger host has only the
 * system Python 3.9, and yt-dlp requires Python >= 3.11, so every call died
 * at import. The YouTube downloader, the Instagram downloader and AutoClip's
 * import-from-URL all failed in production for every user (found 2026-11-05,
 * Sentry CLIPIRO-WEB-Q).
 *
 * WHY THE ONE-DIRECTORY BUILD
 * ---------------------------
 * yt-dlp ships two standalone (bundled-Python) Linux builds. The one-file
 * `yt-dlp_linux` unpacks its shared libraries into $TMPDIR on EVERY run and
 * loads them from there. Hostinger mounts /tmp noexec, so it died with
 * "libz.so.1: failed to map segment from shared object" — the first deploy of
 * this script failed its own verify:ytdlp step on exactly that (2026-11-05).
 * `yt-dlp_linux.zip` is the one-directory build: the executable plus an
 * `_internal/` folder, run in place, nothing written to /tmp. It is also
 * faster, since nothing is unpacked per call.
 *
 * The zip is verified by SHA-256 before it is trusted, then extracted to a
 * stable path outside node_modules — the same ownership model as
 * scripts/install-render-ffmpeg.mjs.
 *
 * MOVING THE PIN
 * --------------
 * YouTube changes often enough that yt-dlp needs updating every few weeks
 * (a four-month-old build got HTTP 403 on video data). To bump: take the new
 * tag from https://github.com/yt-dlp/yt-dlp/releases, copy the
 * `yt-dlp_linux.zip` line from that release's SHA2-256SUMS asset, and update
 * version + url + sha256 + bytes together. The build's `verify:ytdlp` step
 * fails if the installed binary doesn't run or doesn't report the pin.
 *
 * Non-Linux platforms are skipped: Windows/macOS development keeps using
 * youtube-dl-exec's own binary (yt-dlp.exe on Windows is already standalone),
 * and lib/ytdlp.ts falls through to it.
 */

import fs from "fs";
import path from "path";
import zlib from "zlib";
import crypto from "crypto";
import { pathToFileURL } from "url";

// ── The pin. Change these four values together. ──
const PINNED = {
  version: "2026.10.26",
  url: "https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp_linux.zip",
  // From that release's SHA2-256SUMS, and re-checked against a download.
  sha256: "f34053415136e55073dd64ba5326d161ecc23ce0e98c081d8752867b37809450",
  bytes: 41236547,
};

/** Stable, application-owned location. Kept out of node_modules so a package
 *  reinstall (whose postinstall writes the Python zipapp) cannot replace it. */
export const YTDLP_DIR = path.join(process.cwd(), "vendor", "yt-dlp");
/** The executable inside the one-directory build (its libraries sit beside it in _internal/). */
export const YTDLP_PATH = path.join(YTDLP_DIR, "yt-dlp_linux");
/** Records which archive the directory was extracted from. */
const MARKER = path.join(YTDLP_DIR, ".pinned-sha256");

export const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

export { PINNED };

/** Throws unless `buf` is exactly the pinned artifact. Exported so the
 *  fatal-on-mismatch behaviour is tested rather than assumed. */
export function assertArtifact(buf, expectedSha, expectedBytes) {
  const actual = sha256(buf);
  if (actual !== expectedSha) {
    throw new Error(
      `[yt-dlp] CHECKSUM MISMATCH — refusing to install.\n` +
      `  expected ${expectedSha}\n  actual   ${actual}\n` +
      `  The pinned artifact changed at the source. Do not bypass this; verify the artifact before updating the pin.`,
    );
  }
  if (expectedBytes !== undefined && buf.length !== expectedBytes) {
    throw new Error(`[yt-dlp] SIZE MISMATCH — expected ${expectedBytes} bytes, got ${buf.length}.`);
  }
}

/**
 * Extract a (non-zip64) zip archive into `dest`, keeping unix file modes.
 * Small on purpose: Node has no zip reader, and depending on a package that is
 * only present transitively would break the deploy the day it moves.
 * Refuses any entry that would land outside `dest`.
 */
export function extractZip(buf, dest) {
  // End of central directory: signature 0x06054b50, within the last 64 KiB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("[yt-dlp] not a zip archive (no end-of-central-directory record)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const root = path.resolve(dest);
  const files = [];

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("[yt-dlp] corrupt zip central directory");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const mode = (buf.readUInt32LE(p + 38) >>> 16) & 0o777;
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;

    const target = path.resolve(root, name);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`[yt-dlp] zip entry escapes target: ${name}`);
    if (name.endsWith("/")) { fs.mkdirSync(target, { recursive: true }); continue; }

    if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`[yt-dlp] corrupt zip local header: ${name}`);
    const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const raw = buf.subarray(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error(`[yt-dlp] unsupported zip compression method ${method}: ${name}`);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    if (mode) fs.chmodSync(target, mode);
    files.push(name);
  }
  return files;
}

function alreadyInstalled() {
  try {
    return fs.readFileSync(MARKER, "utf8").trim() === PINNED.sha256 && fs.existsSync(YTDLP_PATH);
  } catch {
    return false;
  }
}

async function download(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  if (process.platform !== "linux" || process.arch !== "x64") {
    console.log(`[yt-dlp] skipped — ${process.platform}/${process.arch} uses youtube-dl-exec's own binary.`);
    return;
  }

  if (alreadyInstalled()) {
    console.log(`[yt-dlp] already installed and checksum-verified: ${YTDLP_PATH}`);
    return;
  }

  console.log(`[yt-dlp] installing pinned yt-dlp ${PINNED.version} (standalone, one-directory) …`);

  let archive;
  let lastErr;
  // Transient network failure should retry; a checksum mismatch must not.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      archive = await download(PINNED.url);
      break;
    } catch (e) {
      lastErr = e;
      console.warn(`[yt-dlp] download attempt ${attempt} failed: ${e.message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  if (!archive) throw new Error(`could not download pinned yt-dlp after 3 attempts: ${lastErr?.message}`);

  assertArtifact(archive, PINNED.sha256, PINNED.bytes);

  // Extract beside the target, then swap in: a crashed install never leaves a
  // half-extracted directory that a later existence check would trust.
  const staging = `${YTDLP_DIR}.partial`;
  fs.rmSync(staging, { recursive: true, force: true });
  const files = extractZip(archive, staging);
  const exe = path.join(staging, path.basename(YTDLP_PATH));
  if (!fs.existsSync(exe)) throw new Error(`[yt-dlp] archive has no ${path.basename(YTDLP_PATH)} executable`);
  fs.chmodSync(exe, 0o755);
  fs.writeFileSync(path.join(staging, path.basename(MARKER)), `${PINNED.sha256}\n`);
  fs.rmSync(YTDLP_DIR, { recursive: true, force: true });
  fs.renameSync(staging, YTDLP_DIR);

  console.log(`[yt-dlp] installed yt-dlp ${PINNED.version} (${files.length} files) -> ${YTDLP_DIR}`);
  console.log(`[yt-dlp] sha256 verified: ${PINNED.sha256}`);
}

// Only install when executed directly — importing this module (its test)
// must not trigger a download.
const executedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) {
  main().catch((err) => {
    console.error(err.message ?? err);
    // Fail the install: a deploy without a runnable yt-dlp ships three
    // features that are guaranteed to fail.
    process.exit(1);
  });
}
