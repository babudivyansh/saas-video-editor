/**
 * Installs the pinned Linux render runtime (P0-2).
 *
 * WHY THIS EXISTS
 * ---------------
 * `ffmpeg-static@5.3.0` resolves its Linux x64 asset from release tag
 * `b6.1.1` — a tag that names the ffmpeg-static release, NOT the ffmpeg
 * version. That asset was republished on 2025-11-14 as a johnvansickle
 * **7.0.2** build configured without `libharfbuzz`. FFmpeg 7.0 made harfbuzz
 * a hard dependency of the `drawtext` filter, so `drawtext` is silently not
 * compiled: 32 of Clipiro's 33 required filters are present and drawtext is
 * the only one missing.
 *
 * Every applicable production render reaches drawtext — editor text clips,
 * the editor free-tier watermark, the AutoClip free-tier watermark, and
 * streamer-video titles — so ffmpeg fails while parsing `-filter_complex`
 * with exit 8, before any encoding begins. That is P0-2.
 *
 * The production host has no system ffmpeg at any standard location or on
 * PATH (all candidates ENOENT), so the runtime must be application-owned and
 * deterministic. This script is that ownership: one exact artifact, verified
 * by SHA-256 before it is trusted, installed at a stable path.
 *
 * Runs from `postinstall`, so the binary is materialised on the deploy host
 * from source control rather than by hand-editing a server.
 *
 * Non-Linux platforms are skipped deliberately: the same ffmpeg-static
 * release ships ffmpeg 6.1.1 for Windows/macOS, which predates the harfbuzz
 * requirement and does have drawtext. Development is unaffected, and
 * `resolveFfmpegBin()` falls through to it.
 */

import fs from "fs";
import path from "path";
import zlib from "zlib";
import crypto from "crypto";
import { pathToFileURL } from "url";

// ── The pin. Changing any of these three values together is the only
// supported way to move the render runtime. ──
const PINNED = {
  version: "6.0-static",
  // johnvansickle build, redistributed by the ffmpeg-static project. Same
  // provider and licensing family as the binary it replaces (GPL/version3,
  // as the current production build already reports) — this is not a
  // licensing change, only a version pin backwards to before drawtext
  // required harfbuzz.
  url: "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-linux-x64.gz",
  // SHA-256 of the downloaded .gz, and of the decompressed executable. The
  // second is the one that actually matters — it is what runs.
  archiveSha256: "17c1ae10b52ac499180679fe6ba77e17642390c4eedb0f1e3b0ac045da55128f",
  binarySha256: "ed652b2f32e0851d1946894fb8333f5b677c1b2ce6b9d187910a67f8b99da028",
  binaryBytes: 78683840,
};

/** Stable, application-owned location. Kept out of node_modules so a package
 *  reinstall cannot silently replace the verified runtime. */
export const RENDER_FFMPEG_DIR = path.join(process.cwd(), "vendor", "ffmpeg");
export const RENDER_FFMPEG_PATH = path.join(RENDER_FFMPEG_DIR, "ffmpeg");

export const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

export { PINNED };

/**
 * Throws unless `buf` is exactly the pinned artifact.
 *
 * Separated out and exported so the fatal-on-mismatch behaviour is unit
 * tested rather than assumed — a checksum check that silently passes is
 * worse than none, because it manufactures false confidence in the supply
 * chain.
 */
export function assertArtifact(buf, expectedSha, label, expectedBytes) {
  const actual = sha256(buf);
  if (actual !== expectedSha) {
    throw new Error(
      `[render-ffmpeg] ${label} CHECKSUM MISMATCH — refusing to install.\n` +
      `  expected ${expectedSha}\n  actual   ${actual}\n` +
      `  The pinned artifact changed at the source. Do not bypass this; verify the artifact before updating the pin.`,
    );
  }
  if (expectedBytes !== undefined && buf.length !== expectedBytes) {
    throw new Error(`[render-ffmpeg] ${label} SIZE MISMATCH — expected ${expectedBytes} bytes, got ${buf.length}.`);
  }
}

function alreadyInstalled() {
  try {
    const buf = fs.readFileSync(RENDER_FFMPEG_PATH);
    return sha256(buf) === PINNED.binarySha256;
  } catch {
    return false;
  }
}

async function download(url, redirectsLeft = 5) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    // fetch follows redirects itself; this guard is for the rare provider
    // that answers a 3xx without a Location fetch will act on.
    if (res.status >= 300 && res.status < 400 && redirectsLeft > 0) {
      const next = res.headers.get("location");
      if (next) return download(next, redirectsLeft - 1);
    }
    throw new Error(`download failed: HTTP ${res.status} ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  if (process.platform !== "linux" || process.arch !== "x64") {
    console.log(`[render-ffmpeg] skipped — ${process.platform}/${process.arch} uses the bundled ffmpeg-static build, which has drawtext.`);
    return;
  }

  if (alreadyInstalled()) {
    console.log(`[render-ffmpeg] already installed and checksum-verified: ${RENDER_FFMPEG_PATH}`);
    return;
  }

  console.log(`[render-ffmpeg] installing pinned ffmpeg ${PINNED.version} …`);

  let archive;
  let lastErr;
  // Transient network failure should retry; a checksum mismatch must not.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      archive = await download(PINNED.url);
      break;
    } catch (e) {
      lastErr = e;
      console.warn(`[render-ffmpeg] download attempt ${attempt} failed: ${e.message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  if (!archive) throw new Error(`could not download pinned ffmpeg after 3 attempts: ${lastErr?.message}`);

  assertArtifact(archive, PINNED.archiveSha256, "ARCHIVE");
  const binary = zlib.gunzipSync(archive);
  assertArtifact(binary, PINNED.binarySha256, "BINARY", PINNED.binaryBytes);

  fs.mkdirSync(RENDER_FFMPEG_DIR, { recursive: true });
  // Write to a temp name then rename, so a crashed install can never leave a
  // half-written binary that later passes an existence check.
  const tmp = `${RENDER_FFMPEG_PATH}.partial`;
  fs.writeFileSync(tmp, binary);
  fs.chmodSync(tmp, 0o755);
  fs.renameSync(tmp, RENDER_FFMPEG_PATH);

  console.log(`[render-ffmpeg] installed ffmpeg ${PINNED.version} -> ${RENDER_FFMPEG_PATH}`);
  console.log(`[render-ffmpeg] sha256 verified: ${PINNED.binarySha256}`);
}

// Only install when executed directly — importing this module (e.g. from its
// test) must not trigger a download.
const executedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) {
  main().catch((err) => {
    console.error(err.message ?? err);
    // Fail the install. A deploy that cannot produce a verified render runtime
    // must not proceed silently to serve exports that are guaranteed to fail.
    process.exit(1);
  });
}
