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
 * at import with a Python traceback in ~0.2 s. The YouTube downloader, the
 * Instagram downloader and AutoClip's import-from-URL all failed in
 * production for every user (found 2026-11-05, Sentry CLIPIRO-WEB-Q).
 * Nothing noticed: youtube-dl-exec's own preinstall check only asks for
 * Python >= 3.9, and the deploy sets YOUTUBE_DL_SKIP_PYTHON_CHECK anyway.
 *
 * `yt-dlp_linux` is the same release built as a self-contained executable
 * (PyInstaller, bundled Python): no interpreter needed on the host. This
 * script installs one exact build of it, verified by SHA-256 before it is
 * trusted, at a stable path outside node_modules — the same ownership model
 * as scripts/install-render-ffmpeg.mjs.
 *
 * MOVING THE PIN
 * --------------
 * YouTube changes often enough that yt-dlp needs updating every few weeks.
 * To bump: take the new tag from https://github.com/yt-dlp/yt-dlp/releases,
 * copy the `yt-dlp_linux` line from that release's SHA2-256SUMS asset, and
 * update version + url + sha256 + bytes together. Then redeploy. The build's
 * `verify:ytdlp` step fails if the installed binary doesn't report the pin.
 *
 * Non-Linux platforms are skipped: Windows/macOS development keeps using
 * youtube-dl-exec's own binary (yt-dlp.exe on Windows is already standalone),
 * and lib/ytdlp.ts falls through to it.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { pathToFileURL } from "url";

// ── The pin. Change these four values together. ──
const PINNED = {
  version: "2026.10.26",
  url: "https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp_linux",
  // From that release's SHA2-256SUMS, and re-checked against a download.
  sha256: "767ba9dce7052aa196f8b12652f433d76de128ba168966fa84b6394d5e6c6795",
  bytes: 41166968,
};

/** Stable, application-owned location. Kept out of node_modules so a package
 *  reinstall (whose postinstall writes the Python zipapp) cannot replace it. */
export const YTDLP_DIR = path.join(process.cwd(), "vendor", "yt-dlp");
export const YTDLP_PATH = path.join(YTDLP_DIR, "yt-dlp");

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

function alreadyInstalled() {
  try {
    return sha256(fs.readFileSync(YTDLP_PATH)) === PINNED.sha256;
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

  console.log(`[yt-dlp] installing pinned yt-dlp ${PINNED.version} (standalone) …`);

  let binary;
  let lastErr;
  // Transient network failure should retry; a checksum mismatch must not.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      binary = await download(PINNED.url);
      break;
    } catch (e) {
      lastErr = e;
      console.warn(`[yt-dlp] download attempt ${attempt} failed: ${e.message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  if (!binary) throw new Error(`could not download pinned yt-dlp after 3 attempts: ${lastErr?.message}`);

  assertArtifact(binary, PINNED.sha256, PINNED.bytes);

  fs.mkdirSync(YTDLP_DIR, { recursive: true });
  // Temp name then rename: a crashed install never leaves a half-written
  // binary that later passes an existence check.
  const tmp = `${YTDLP_PATH}.partial`;
  fs.writeFileSync(tmp, binary);
  fs.chmodSync(tmp, 0o755);
  fs.renameSync(tmp, YTDLP_PATH);

  console.log(`[yt-dlp] installed yt-dlp ${PINNED.version} -> ${YTDLP_PATH}`);
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
