// Import a source video from a URL instead of uploading it.
//
// Uploading is currently the only way into AutoClip, which is a poor fit for
// its main use case: the podcast or webinar a creator wants clipped is almost
// always already online, and making them download a 2GB file to re-upload it
// is the most common reason to bounce at step one.
//
// The yt-dlp plumbing already exists in app/api/tools/youtube-downloader —
// this reuses the same library rather than adding a second downloader, but
// targets a Project's source rather than streaming a file back to the user,
// and honours the tier's AutoClip length cap instead of that tool's flat
// 20-minute limit.

import { uploadFileToS3 } from "@/utils/s3-upload";
import { SOURCE_HOSTS, SOURCE_HOSTS_LABEL } from "@clipiro/shared/sources";
import { TIER_MAX_AUTOCLIP_SOURCE_SECONDS, maxUploadBytesForTier, formatBytes } from "@/lib/plans/tiers";
import { logger } from "@/lib/logger";
import { runYtDlp, ytDlpErrorText, YtDlpError, type YtDlpFlags } from "@/lib/ytdlp";
import type { TierId } from "@/lib/plans/tiers";
import ffmpegStatic from "ffmpeg-static";
import { randomUUID } from "crypto";
import path from "path";
import os from "os";
import fs from "fs";

// yt-dlp is resolved and run by lib/ytdlp.ts (pinned standalone build in
// production, plus the optional YTDLP_COOKIES_B64 / YTDLP_PROXY).

function ffmpegDir(): string | undefined {
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return path.dirname(ffmpegStatic);
  const local = path.join(process.cwd(), "node_modules", "ffmpeg-static");
  return fs.existsSync(local) ? local : undefined;
}

// yt-dlp follows redirects itself, so the host allowlist below only vets the
// first hop: an open redirect on an allowed host could land anywhere,
// including 169.254.169.254, where the generic extractor would fetch it and
// hand back its "title". With generic off, a URL no site extractor claims
// fails before any request; the site extractors still all work.
const SITE_EXTRACTORS_ONLY = { useExtractors: "default,-generic" };

export class UrlImportError extends Error {}

export interface UrlImportResult {
  url: string;
  /** S3 key the video was stored under — lets the caller adopt it as an
   *  Asset (Global Asset Library) without re-uploading or re-downloading. */
  key: string;
  title: string;
  durationSec: number;
  bytes: number;
}

/**
 * Hosts we accept. An allowlist rather than a blocklist: this fetches a
 * server-side URL, so anything unconstrained here is an SSRF primitive
 * (`http://169.254.169.254/…` reaching cloud metadata, for instance).
 * The list lives in @clipiro/shared so the phone app and the server agree.
 */
const ALLOWED_HOSTS: readonly string[] = SOURCE_HOSTS;

export const UNSUPPORTED_LINK_MESSAGE = `That link isn't supported. Paste a ${SOURCE_HOSTS_LABEL} URL.`;

export function isAllowedSourceUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return ALLOWED_HOSTS.includes(host);
  } catch {
    return false;
  }
}

interface ProbeInfo { title?: string; duration?: number; is_live?: boolean }

/** Read metadata without downloading, so length is rejected before the bytes. */
export async function probeSourceUrl(url: string): Promise<{ title: string; durationSec: number; isLive: boolean }> {
  const info = (await runYtDlp(url, {
    dumpSingleJson: true,
    ...SITE_EXTRACTORS_ONLY,
    noWarnings: true,
    noPlaylist: true,
    skipDownload: true,
    socketTimeout: 30, // seconds; a stalled host fails the probe instead of hanging it
  })) as ProbeInfo;

  return {
    title: (info.title ?? "Imported video").slice(0, 200),
    durationSec: Math.round(info.duration ?? 0),
    isLive: Boolean(info.is_live),
  };
}

/**
 * Download a source URL and store it as a project's source video.
 * Throws UrlImportError with a message written for the user.
 */
/**
 * Deletes the download and every sidecar yt-dlp wrote next to it. With
 * separate video and audio formats yt-dlp downloads `<name>.f399.mp4.part`,
 * `<name>.f140.m4a`, … and merges them into `<name>`; a download that failed
 * or hit the size cap left those behind, because only `<name>` itself was
 * deleted. One such leftover on the Hostinger disk was 2 GB (2026-11-19).
 */
export function removeDownloadArtifacts(tmpPath: string): void {
  const dir = path.dirname(tmpPath);
  const stem = path.basename(tmpPath, path.extname(tmpPath));
  try {
    for (const name of fs.readdirSync(dir)) {
      if (name === stem || name.startsWith(`${stem}.`)) {
        try { fs.rmSync(path.join(dir, name), { force: true }); } catch { /* best-effort */ }
      }
    }
  } catch { /* tmp unreadable: the sweep (lib/tmp-sweep.ts) gets it later */ }
}

/**
 * The download attempts, in order. YouTube intermittently answers the
 * server's requests for its adaptive (web client) formats with an empty body,
 * and yt-dlp fails with "Did not get any data blocks" after the probe
 * succeeded (CLIPIRO-WEB-T / WEB-1M, 2026-11-16..19, latest yt-dlp). A second
 * try usually gets through; the last one asks YouTube's mobile-web client,
 * whose streams were still served when the web formats were refused
 * (reproduced 2026-11-20: web formats 403, mweb downloaded). That stream can
 * be lower resolution, which beats a failed import. Other sites ignore
 * youtube: extractor args.
 */
export const DOWNLOAD_ATTEMPTS: ReadonlyArray<{ delayMs: number; flags: YtDlpFlags }> = [
  { delayMs: 0, flags: {} },
  { delayMs: 3_000, flags: {} },
  { delayMs: 3_000, flags: { extractorArgs: "youtube:player_client=mweb" } },
];

async function downloadWithRetries(url: string, baseFlags: YtDlpFlags, tmpPath: string, attempts = DOWNLOAD_ATTEMPTS): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const { delayMs, flags } = attempts[i];
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    try {
      await runYtDlp(url, { ...baseFlags, ...flags });
      if (i > 0) logger.info("url-import", `download succeeded on attempt ${i + 1}`);
      return;
    } catch (err) {
      lastErr = err;
      // Start the next attempt clean: a half-written .part would be resumed.
      removeDownloadArtifacts(tmpPath);
      if (i < attempts.length - 1) logger.warn("url-import", `download attempt ${i + 1} failed: ${ytDlpErrorText(err)}`);
    }
  }
  throw lastErr;
}

/** yt-dlp format selector for URL imports: H.264 ≤1080p, then any mp4 ≤1080p, then anything. */
export const URL_IMPORT_FORMAT = [
  "bestvideo[height<=1080][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]",
  "best[height<=1080][ext=mp4][vcodec^=avc1]",
  "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]",
  "best[height<=1080][ext=mp4]",
  "best",
].join("/");

export async function importSourceFromUrl(args: {
  url: string;
  userId: string;
  projectId: string;
  tier: TierId;
}): Promise<UrlImportResult> {
  const { url, userId, projectId, tier } = args;

  if (!isAllowedSourceUrl(url)) {
    throw new UrlImportError(UNSUPPORTED_LINK_MESSAGE);
  }

  let probe;
  try {
    probe = await probeSourceUrl(url);
  } catch (err) {
    // error, not warn: a binary that can't run fails EVERY import here, and
    // warn never reaches Sentry — that is how a dead yt-dlp went unnoticed.
    logger.error("url-import", `probe failed for ${url}`, new YtDlpError("url-import probe failed", ytDlpErrorText(err)));
    throw new UrlImportError("We couldn't read that link. It may be private, region-locked, or removed.");
  }

  if (probe.isLive) throw new UrlImportError("That stream is still live. Import it once the broadcast has ended and the VOD is up.");

  const cap = TIER_MAX_AUTOCLIP_SOURCE_SECONDS[tier];
  if (probe.durationSec > cap) {
    throw new UrlImportError(
      `That video is ${Math.round(probe.durationSec / 60)} min — your plan supports Auto Clips up to ${Math.round(cap / 60)} min. Upgrade for longer sources.`,
    );
  }

  // Single source of truth for "max individual file size" — lib/plans/tiers.ts
  // MAX_UPLOAD_BYTES_BY_TIER, the same cap every other upload path enforces.
  const maxBytes = maxUploadBytesForTier(tier);

  const tmpPath = path.join(os.tmpdir(), `import-${projectId}-${randomUUID()}.mp4`);
  try {
    const baseFlags = {
      output: tmpPath,
      // H.264 first. `[ext=mp4]` alone does not exclude AV1 — YouTube ships
      // av01 in mp4 too, and yt-dlp ranks it above avc1 — and a 1080p60 AV1
      // source decoded at 3.5 fps on the production host, so every AutoClip
      // render of it hit the 15-min watchdog (Sentry CLIPIRO-WEB-20). VP9
      // (webm) is skipped for the same reason; AV1/other mp4 stay as the
      // fallback for sources that offer nothing else.
      format: URL_IMPORT_FORMAT,
      mergeOutputFormat: "mp4",
      ...SITE_EXTRACTORS_ONLY,
      noPlaylist: true,
      noWarnings: true,
      socketTimeout: 30, // seconds without data before yt-dlp gives up
      // Abort the download itself once it would exceed the tier's cap,
      // instead of only checking st.size AFTER the full file has already
      // landed on disk — a high-bitrate source within the duration cap could
      // otherwise fill the VPS disk before the post-download guard below ever
      // runs. (bare integer = bytes to yt-dlp.)
      maxFilesize: String(maxBytes),
      ...(ffmpegDir() ? { ffmpegLocation: ffmpegDir()! } : {}),
    };
    await downloadWithRetries(url, baseFlags, tmpPath);

    // Backstop for the streaming/unknown-size case yt-dlp can't pre-check.
    if (!fs.existsSync(tmpPath)) throw new UrlImportError("The download finished but produced no file.");
    const bytes = fs.statSync(tmpPath).size;
    if (bytes > maxBytes) {
      throw new UrlImportError(
        `That video is ${formatBytes(bytes)} — your plan supports imports up to ${formatBytes(maxBytes)}. Upgrade to import larger sources.`,
      );
    }

    const key = `uploads/${userId}/${projectId}-${randomUUID()}.mp4`;
    const stored = await uploadFileToS3(tmpPath, key, "video/mp4");

    return { url: stored, key, title: probe.title, durationSec: probe.durationSec, bytes };
  } catch (err) {
    if (err instanceof UrlImportError) throw err;
    logger.error("url-import", `download failed for ${url}`, new YtDlpError("url-import download failed", ytDlpErrorText(err)));
    throw new UrlImportError("We couldn't download that video. It may be private or restricted.");
  } finally {
    removeDownloadArtifacts(tmpPath);
  }
}
