import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { probeUploadedMedia, safeMediaExtension, UNSAFE_MEDIA_MESSAGE } from "@/utils/ffmpeg-render";

/**
 * Write an uploaded audio/video file to a temp path and confirm ffmpeg sees a
 * real media container in it — the step every FFmpeg tool route runs before
 * charging or processing (2026-10-14 tools audit).
 *
 * The temp extension comes from an allow-list, never the user's filename (a
 * `.m3u8` name is what lets ffmpeg open an uploaded HLS playlist), and the
 * probe rejects playlist/indirection formats whatever the file is called. On
 * rejection the temp file is already removed and the 400 is ready to return.
 */
export async function saveMediaUpload(
  file: File,
  jobId: string,
  fallbackExt: string,
  suffix = "input",
): Promise<{ inputPath: string; durationSec: number } | NextResponse> {
  const inputPath = path.join(os.tmpdir(), `${jobId}-${suffix}.${safeMediaExtension(file.name, fallbackExt)}`);
  fs.writeFileSync(inputPath, Buffer.from(await file.arrayBuffer()));
  const probe = await probeUploadedMedia(inputPath);
  if (!probe.safe) {
    try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    return NextResponse.json({ error: UNSAFE_MEDIA_MESSAGE }, { status: 400 });
  }
  return { inputPath, durationSec: probe.durationSec };
}
