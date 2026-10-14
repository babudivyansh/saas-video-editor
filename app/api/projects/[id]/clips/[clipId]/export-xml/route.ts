import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getServerAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { ZipWriter } from "@/lib/zip-writer";
import { buildSrt, buildXmeml, exportReadme } from "@/lib/clip-export-xml";

// GET /api/projects/[id]/clips/[clipId]/export-xml
// A zip of clip.xml (an FCP7 XML sequence for Premiere / Resolve), captions.srt
// and a README. Text only, so it's small and needs no S3 read. See
// lib/clip-export-xml.ts for why the sequence points at the original video.

function safeBase(s: string): string {
  return s.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "clip";
}

/** The name the user's original file most likely has on their disk. */
function sourceFileName(project: { title: string; sourceAsset: { name: string; mimeType: string } | null }): string {
  const name = (project.sourceAsset?.name || project.title || "source").trim();
  if (/\.[a-z0-9]{2,4}$/i.test(name)) return name;
  const ext = project.sourceAsset?.mimeType === "video/quicktime" ? "mov" : "mp4";
  return `${name}.${ext}`;
}

async function handleGET(req: NextRequest, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  // Opened by a plain <a> download, which sends the cookie but no Bearer.
  const auth = (await getAuthUser(req)) ?? (await getServerAuthUser());
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  const clip = await prisma.clip.findFirst({
    where: { id: clipId, projectId, project: { userId: auth.userId } },
    select: {
      index: true, title: true, startSec: true, endSec: true, aspectRatio: true, transcriptJson: true,
      project: { select: { title: true, sourceAsset: { select: { name: true, mimeType: true, duration: true } } } },
    },
  });
  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

  const name = clip.title?.trim() || `Clip ${clip.index + 1}`;
  const source = sourceFileName(clip.project);

  const zip = new ZipWriter();
  zip.addFile(
    "clip.xml",
    Buffer.from(
      buildXmeml({
        name,
        sourceFileName: source,
        sourceDurationSec: clip.project.sourceAsset?.duration ?? null,
        startSec: clip.startSec,
        endSec: clip.endSec,
        aspectRatio: clip.aspectRatio,
      }),
      "utf8",
    ),
  );
  const srt = buildSrt(clip.transcriptJson);
  if (srt) zip.addFile("captions.srt", Buffer.from(srt, "utf8"));
  zip.addFile("README.txt", Buffer.from(exportReadme(source), "utf8"));

  const body = zip.toBuffer();
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeBase(name)}-xml.zip"`,
      "Content-Length": String(body.length),
      "Cache-Control": "no-store",
    },
  });
}

export const GET = withRateLimit(handleGET, { limit: 30, windowSec: 60, keyBy: "user", name: "clips:export-xml" });
