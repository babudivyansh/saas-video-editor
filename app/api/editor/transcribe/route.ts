import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import os from "os";
import path from "path";
import fs from "fs";
import { getAuthUser } from "@/lib/auth";
import { extractAudio } from "@/utils/ffmpeg-render";
import { transcribeAudio } from "@/utils/elevenlabs";
import { downloadFile } from "@/utils/download";

export const maxDuration = 300;

// Transcribe a video's speech to word-level timings for caption editing. No credit
// charge — credits are taken at export. Reuses extractAudio + ElevenLabs Scribe.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { videoUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const videoUrl = (body.videoUrl ?? "").trim();
  if (!videoUrl) return NextResponse.json({ error: "videoUrl is required" }, { status: 400 });

  const tmp = os.tmpdir();
  const id = randomUUID();
  const videoPath = path.join(tmp, `${id}-src.mp4`);
  const audioPath = path.join(tmp, `${id}-audio.mp3`);

  try {
    await downloadFile(videoUrl, videoPath);
    await extractAudio(videoPath, audioPath);
    const segments = await transcribeAudio(fs.readFileSync(audioPath));
    return NextResponse.json({ segments });
  } catch (err) {
    console.error("[editor/transcribe]", err);
    // Captions are optional — never hard-fail the editor. Return empty segments
    // with a warning so the user can still format, crop and export the clip.
    const e = String(err);
    const warning = /speech_to_text|missing_permissions/.test(e)
      ? "Auto-captions are unavailable: this server's ElevenLabs API key is missing the speech-to-text permission. You can still format and export your video."
      : "Couldn't auto-caption this clip. You can still format and export your video.";
    return NextResponse.json({ segments: [], warning });
  } finally {
    for (const p of [videoPath, audioPath]) {
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
    }
  }
}
