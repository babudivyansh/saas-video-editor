import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { uploadBufferToS3 } from "@/utils/s3-upload";
import { randomUUID } from "crypto";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const ext = (file.name.split(".").pop() ?? "mp4").toLowerCase();
  const key = `uploads/${auth.userId}/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await uploadBufferToS3(buffer, key, file.type || "video/mp4");

  return NextResponse.json({ url, key });
}
