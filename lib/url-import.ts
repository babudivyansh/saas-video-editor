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

import { create as createYoutubeDl } from "youtube-dl-exec";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { TIER_MAX_AUTOCLIP_SOURCE_SECONDS } from "@/lib/plans/tiers";
import { logger } from "@/lib/logger";
import type { TierId } from "@/lib/plans/tiers";
import ffmpegStatic from "ffmpeg-static";
import { randomUUID } from "crypto";
import path from "path";
import os from "os";
import fs from "fs";

const ytdlBinary = path.join(
  process.cwd(),
  "node_modules",
  "youtube-dl-exec",
  "bin",
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
);
const youtubeDl = createYoutubeDl(fs.existsSync(ytdlBinary) ? ytdlBinary : "yt-dlp");

function ffmpegDir(): string | undefined {
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return path.dirname(ffmpegStatic);
  const local = path.join(process.cwd(), "node_modules", "ffmpeg-static");
  return fs.existsSync(local) ? local : undefined;
}

/** 2GB — well past any realistic talk recording, and a guard against a bad URL. */
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

export class UrlImportError extends Error {}

export interface UrlImportResult {
  url: string;
  title: string;
  durationSec: number;
  bytes: number;
}

/**
 * Hosts we accept. An allowlist rather than a blocklist: this fetches a
 * server-side URL, so anything unconstrained here is an SSRF primitive
 * (`http://169.254.169.254/…` reaching cloud metadata, for instance).
 */
const ALLOWED_HOSTS = [
  "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "music.youtube.com",
  "vimeo.com", "player.vimeo.com",
  "drive.google.com", "docs.google.com",
  "dropbox.com", "www.dropbox.com",
  "loom.com", "www.loom.com",
];

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
  const info = (await youtubeDl(url, {
    dumpSingleJson: true,
    noWarnings: true,
    noPlaylist: true,
    skipDownload: true,
  })) as unknown as ProbeInfo;

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
export async function importSourceFromUrl(args: {
  url: string;
  userId: string;
  projectId: string;
  tier: TierId;
}): Promise<UrlImportResult> {
  const { url, userId, projectId, tier } = args;

  if (!isAllowedSourceUrl(url)) {
    throw new UrlImportError("That link isn't supported. Paste a YouTube, Vimeo, Loom, Drive or Dropbox URL.");
  }

  let probe;
  try {
    probe = await probeSourceUrl(url);
  } catch (err) {
    logger.warn("url-import", `probe failed for ${url}`, err);
    throw new UrlImportError("We couldn't read that link. It may be private, region-locked, or removed.");
  }

  if (probe.isLive) throw new UrlImportError("That's a live stream — wait until it has finished, then import it.");

  const cap = TIER_MAX_AUTOCLIP_SOURCE_SECONDS[tier];
  if (probe.durationSec > cap) {
    throw new UrlImportError(
      `That video is ${Math.round(probe.durationSec / 60)} min — your plan supports Auto Clips up to ${Math.round(cap / 60)} min. Upgrade for longer sources.`,
    );
  }

  const tmpPath = path.join(os.tmpdir(), `import-${projectId}-${randomUUID()}.mp4`);
  try {
    await youtubeDl(url, {
      output: tmpPath,
      format: "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best",
      mergeOutputFormat: "mp4",
      noPlaylist: true,
      noWarnings: true,
      ...(ffmpegDir() ? { ffmpegLocation: ffmpegDir()! } : {}),
    });

    if (!fs.existsSync(tmpPath)) throw new UrlImportError("The download finished but produced no file.");
    const bytes = fs.statSync(tmpPath).size;
    if (bytes > MAX_BYTES) throw new UrlImportError("That video is too large to import.");

    const key = `uploads/${userId}/${projectId}-${randomUUID()}.mp4`;
    const stored = await uploadFileToS3(tmpPath, key, "video/mp4");

    return { url: stored, title: probe.title, durationSec: probe.durationSec, bytes };
  } catch (err) {
    if (err instanceof UrlImportError) throw err;
    logger.error("url-import", `download failed for ${url}`, err);
    throw new UrlImportError("We couldn't download that video. It may be private or restricted.");
  } finally {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
  }
}
