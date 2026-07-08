import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { uploadBufferToS3 } from "@/utils/s3-upload";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

export const maxDuration = 300;

function getKind(mimeType: string): "video" | "audio" | "image" {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "image";
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const skipAsset = new URL(req.url).searchParams.get("skipAsset") === "true";

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

  // Stored objects are served back with this exact Content-Type and no
  // Content-Disposition/CDN layer forces a download, so an unrestricted
  // upload (e.g. text/html) would be a stored-XSS vector on the S3 origin.
  const ALLOWED_MIME = /^(video|audio|image)\/(mp4|mpeg|quicktime|webm|x-matroska|mp3|wav|ogg|png|jpeg|jpg|webp|gif)$/;
  if (!ALLOWED_MIME.test(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
  }

  const ext = (file.name.split(".").pop() ?? "mp4").toLowerCase();
  const key = `uploads/${auth.userId}/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await uploadBufferToS3(buffer, key, file.type || "video/mp4");

  if (skipAsset) {
    return NextResponse.json({ url, key });
  }

  // Parse optional metadata sent by client before upload
  const duration = formData.get("duration") ? parseFloat(formData.get("duration") as string) : null;
  const width = formData.get("width") ? parseInt(formData.get("width") as string) : null;
  const height = formData.get("height") ? parseInt(formData.get("height") as string) : null;
  const mimeType = file.type || "application/octet-stream";

  const asset = await prisma.asset.create({
    data: {
      userId: auth.userId,
      name: file.name,
      s3Key: key,
      url,
      mimeType,
      kind: getKind(mimeType),
      size: file.size,
      duration: duration ?? undefined,
      width: width ?? undefined,
      height: height ?? undefined,
    },
  });

  return NextResponse.json({ url, key, asset });
}
