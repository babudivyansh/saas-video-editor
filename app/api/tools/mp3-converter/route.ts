import { NextRequest, NextResponse } from "next/server";
import { runFFmpegArgs } from "@/utils/ffmpeg-render";
import { attachmentDisposition } from "@/utils/content-disposition";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const MAX_BYTES = 500 * 1024 * 1024; // 500 MB
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 500 MB)" }, { status: 413 });
  }

  const jobId = randomUUID();
  const inputExt = (file.name.split(".").pop() ?? "mp4").toLowerCase();
  const inputPath = path.join(os.tmpdir(), `${jobId}-input.${inputExt}`);
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.mp3`);

  try {
    fs.writeFileSync(inputPath, Buffer.from(await file.arrayBuffer()));

    await runFFmpegArgs([
      "-y", "-i", inputPath,
      "-vn",
      "-acodec", "libmp3lame", "-q:a", "2",
      outputPath,
    ]);

    const outputBuffer = fs.readFileSync(outputPath);
    const originalName = file.name.replace(/\.[^.]+$/, "");

    return new NextResponse(outputBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": attachmentDisposition(`${originalName}.mp3`),
        "Content-Length": String(outputBuffer.length),
      },
    });
  } finally {
    for (const f of [inputPath, outputPath]) {
      try { fs.unlinkSync(f); } catch {}
    }
  }
}
