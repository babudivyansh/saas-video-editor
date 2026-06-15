import { NextRequest, NextResponse } from "next/server";
import { runFFmpegArgs } from "@/utils/ffmpeg-render";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

const QUALITY_CRF: Record<string, string> = { low: "32", medium: "28", high: "24" };

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

  const quality = (formData.get("quality") as string | null) ?? "medium";
  const crf = QUALITY_CRF[quality] ?? "28";

  const jobId = randomUUID();
  const inputExt = (file.name.split(".").pop() ?? "mp4").toLowerCase();
  const inputPath = path.join(os.tmpdir(), `${jobId}-input.${inputExt}`);
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.mp4`);

  try {
    fs.writeFileSync(inputPath, Buffer.from(await file.arrayBuffer()));

    await runFFmpegArgs([
      "-y", "-i", inputPath,
      "-c:v", "libx264", "-crf", crf, "-preset", "fast",
      "-c:a", "aac", "-b:a", "128k",
      outputPath,
    ]);

    const outputBuffer = fs.readFileSync(outputPath);
    const originalName = file.name.replace(/\.[^.]+$/, "");

    return new NextResponse(outputBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${originalName}-compressed.mp4"`,
        "Content-Length": String(outputBuffer.length),
      },
    });
  } finally {
    for (const f of [inputPath, outputPath]) {
      try { fs.unlinkSync(f); } catch {}
    }
  }
}
