import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import os from "os";
import path from "path";
import fs from "fs";
import { getAuthUser } from "@/lib/auth";
import { create as createYoutubeDl } from "youtube-dl-exec";
import ffmpegStatic from "ffmpeg-static";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { getMediaDurationSec } from "@/utils/ffmpeg-render";

export const maxDuration = 300;

// yt-dlp + ffmpeg binaries (same resolution as the downloader tools).
const YT_DLP_BIN = path.join(
  process.cwd(), "node_modules", "youtube-dl-exec", "bin",
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
);
const ytDlp = createYoutubeDl(YT_DLP_BIN);

function resolveFfmpegDir(): string | undefined {
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return path.dirname(ffmpegStatic);
  const bin = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const cwdPath = path.join(process.cwd(), "node_modules", "ffmpeg-static", bin);
  if (fs.existsSync(cwdPath)) return path.dirname(cwdPath);
  return undefined;
}
const FFMPEG_DIR = resolveFfmpegDir();

function isSupportedUrl(url: string): boolean {
  return /youtube\.com|youtu\.be|instagram\.com/i.test(url);
}

// Import a YouTube/Instagram clip into the editor: download with yt-dlp, push to
// S3, return a playable URL + duration. Reuses the same binaries as the
// youtube-downloader / instagram-downloader tools.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const url = (body.url ?? "").trim();
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });
  if (!isSupportedUrl(url)) {
    return NextResponse.json({ error: "Only YouTube and Instagram links are supported" }, { status: 400 });
  }

  const tmp = os.tmpdir();
  const id = randomUUID();
  const outPath = path.join(tmp, `${id}.mp4`);

  try {
    await ytDlp(url, {
      output: outPath,
      format: "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
      mergeOutputFormat: "mp4",
      noPlaylist: true,
      ...(FFMPEG_DIR ? { ffmpegLocation: FFMPEG_DIR } : {}),
    });

    if (!fs.existsSync(outPath)) {
      return NextResponse.json({ error: "Could not download this video" }, { status: 502 });
    }

    const durationSec = await getMediaDurationSec(outPath);
    const key = `uploads/${auth.userId}/${id}.mp4`;
    const videoUrl = await uploadFileToS3(outPath, key, "video/mp4");

    return NextResponse.json({ videoUrl, durationSec });
  } catch (err) {
    console.error("[editor/import-link]", err);
    const msg = /private|login|unavailable|age/i.test(String(err))
      ? "This video is private or unavailable."
      : "Could not import this link. Please try another.";
    return NextResponse.json({ error: msg }, { status: 502 });
  } finally {
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch { /* ignore */ }
  }
}
